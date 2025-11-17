// Minimal server to proxy image analysis requests to OpenAI
// Usage: create a .env with OPENAI_API_KEY and run `node server/index.js`

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 4000;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) {
  console.warn('Warning: OPENAI_API_KEY is not set. Create a .env file with OPENAI_API_KEY=sk-...');
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple health check for quick verification
app.get('/health', (req, res) => {
  res.json({ ok: true, envHasKey: !!OPENAI_KEY });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const images = req.body.images;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Request must include an "images" array of objects with { dataUrl, filename }' });
    }

    // Build message content with all images (each image expected as { dataUrl, filename })
    const messageContent = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img.dataUrl || img.data_url || img },
    }));

    // Provide a strict JSON-first instruction requesting a single aggregated analysis object
    const filenamesList = images.map((i, idx) => i.filename ?? `image-${idx + 1}`).join(', ');

    messageContent.push({
      type: 'text',
      text: `You will be given ${images.length} images (filenames, in order): ${filenamesList}.

Analyze the IMAGES AS A GROUP (not individually) and return EXACTLY one JSON OBJECT (no array) with the following schema. Use null for unknown values. DO NOT include any surrounding text or markdown — return only the JSON object.

{
  "brand": string,    // Short human-readable summary of the group
  "brandModel": string,     //exact model or sub-model 
  "finish": string | null,     //name of finish or color (e.g., "TV Yellow", "Surf Green", etc.)
  "musicalInstrumentCategory": string,       // Common features across images
  "condition": string,      // "Fair", "Good", "Great", or "Excellent". One word only!
  "notedBlemishes": string[],          // any blemishes shown in the images. max of 40 characters per item.
  "metadataSummary": {
    "serialNumber": string | null,  //serial number if visible
    "colors": string[] | null,
    "materials": string[] | null,
    "estimatedValue": string | null
  }
}

Example (single object):
{"brand":"Gibson","brandModel":"Great","notedBlemishes":["Scratch on headstock", "Ding near pickup"],"metadataSummary":{"serialNumber": "12345","colors":["sunburst","black"],"materials":["wood","metal"],"estimatedValue":"$900"}}

Return ONLY this single JSON object.`,
    });

    // Fail fast if API key is missing
    if (!OPENAI_KEY) {
      console.error('OPENAI_API_KEY is not configured on the server.');
      return res.status(500).json({ error: 'Server missing OPENAI_API_KEY. Set it in .env.' });
    }

    // Log incoming images for debugging (only filenames)
    try {
      const names = images.map((i) => i.filename || 'unknown');
      console.log(`Received /api/analyze request with ${images.length} images:`, names);
    } catch (logErr) {
      console.warn('Failed to log incoming image filenames:', logErr);
    }

    // Call OpenAI Chat Completions (vision-capable model endpoint used in the client previously)
    let response;
    try {
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4.1-mini', // Use appropriate vision-capable model
          messages: [
            {
              role: 'user',
              content: messageContent,
            },
          ],
          max_tokens: 4096,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (axiosErr) {
      console.error('OpenAI request failed:', axiosErr?.response?.status, axiosErr?.response?.data || axiosErr.message || axiosErr);
      const status = axiosErr?.response?.status || 500;
      const data = axiosErr?.response?.data || { error: axiosErr.message || 'OpenAI request failed' };
      return res.status(status).json({ error: 'OpenAI request failed', details: data });
    }

    // Extract model text content
    let content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      content = response.data?.choices?.[0]?.message?.text ?? JSON.stringify(response.data);
    }

    // Try to extract a single JSON object from the model response
    let parsedObj = null;
    const firstObj = content.indexOf('{');
    const lastObj = content.lastIndexOf('}');
    if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
      const objStr = content.substring(firstObj, lastObj + 1);
      try {
        const candidate = JSON.parse(objStr);
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsedObj = candidate;
        }
      } catch (parseErr) {
        console.error('Failed to parse JSON object from model response:', parseErr, { objStr });
        parsedObj = null;
      }
    }

    // If parsing failed (model returned prose or different format), ask the model to convert to the required single-object JSON
    if (!parsedObj) {
      console.warn('No JSON object found in model response; attempting formatter fallback. Raw content:', content);

      const formatterMessages = [
        {
          role: 'system',
          content: 'You are a JSON formatter. Convert the provided human-readable analysis into a single JSON object matching the requested schema. Return ONLY the JSON object, no text.'
        },
        {
          role: 'user',
          content: `Filenames (in order): ${filenamesList}\n\nAnalysis:\n${content}\n\nConvert the analysis into this single JSON object schema (use null for unknowns):\n{\n  "aggregateSummary": string,\n  "itemsDetected": string[],\n  "commonalities": string,\n  "recommendation": string,\n  "confidence": string,\n  "metadataSummary": {\n    "colors": string[] | null,\n    "materials": string[] | null,\n    "brands": string[] | null,\n    "estimatedValueRange": string | null\n  }\n}\nReturn ONLY the JSON object.`
        }
      ];

      try {
        const fmtResp = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4-vision-preview',
            messages: formatterMessages,
            max_tokens: 2000,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        let fmtContent = fmtResp.data?.choices?.[0]?.message?.content;
        if (typeof fmtContent !== 'string') {
          fmtContent = fmtResp.data?.choices?.[0]?.message?.text ?? JSON.stringify(fmtResp.data);
        }

        const fFirstObj = fmtContent.indexOf('{');
        const fLastObj = fmtContent.lastIndexOf('}');
        if (fFirstObj !== -1 && fLastObj !== -1 && fLastObj > fFirstObj) {
          const fmtObjStr = fmtContent.substring(fFirstObj, fLastObj + 1);
          try {
            const candidate = JSON.parse(fmtObjStr);
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
              parsedObj = candidate;
            } else {
              console.error('Formatter returned non-object:', candidate);
              return res.status(500).json({ error: 'Formatter did not return a JSON object' });
            }
          } catch (fparseErr) {
            console.error('Failed to parse JSON from formatter response:', fparseErr, { fmtContent });
            return res.status(500).json({ error: 'Failed to parse JSON from formatter response', details: String(fparseErr) });
          }
        } else {
          console.error('Formatter did not return a JSON object (no braces):', fmtContent);
          return res.status(500).json({ error: 'Formatter did not return a JSON object', raw: fmtContent });
        }
      } catch (fmtErr) {
        console.error('Formatter request failed:', fmtErr?.response?.data || fmtErr.message || fmtErr);
        const status = fmtErr?.response?.status || 500;
        const data = fmtErr?.response?.data || { error: fmtErr.message || 'Formatter request failed' };
        return res.status(status).json({ error: 'Formatter request failed', details: data });
      }
    }

    // Return a single aggregated analysis object
    return res.json({ analysis: parsedObj });
  } catch (err) {
    console.error('Server error while proxying to OpenAI:', err?.response?.data || err.message || err);
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { error: err.message || 'Unknown error' };
    res.status(status).json(data);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
});
