# Image Analyzer - OpenAI Vision API

A React web application that allows users to upload up to 4 images for analysis using OpenAI's Vision API. The application identifies items in images and returns detailed metadata.

## Features

- **Upload up to 4 images** - Drag and drop or click to select images
- **OpenAI Vision API Integration** - Uses GPT-4 Vision to analyze images
- **Detailed Metadata Extraction**:
  - Item identification
  - Description and category
  - Color, material, and brand detection
  - Condition assessment
  - Estimated value
- **Confidence ratings** - Get reliability scores for each analysis
- **Preview management** - Remove individual images before analysis
- **Beautiful UI** - Modern, responsive design with dark mode support

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key with Vision API access

## Installation

1. Clone or navigate to this project directory
2. Install dependencies:

```bash
npm install
```

3. Ensure you have Node.js installed. If not, install it from [nodejs.org](https://nodejs.org)

## Getting Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Create a new API key
4. Copy your API key (it starts with `sk-`)
5. Keep this key secure - never commit it to version control

## Development

Start the development server:

```bash
npm run dev
```

The application will open at `http://localhost:3000`

## Building for Production

Create an optimized production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## How to Use

1. **Enter API Key**: On first load, enter your OpenAI API key
2. **Upload Images**: Click the upload area to select images (up to 4)
3. **Preview**: Review your selected images before analysis
4. **Analyze**: Click "Analyze Images" to process all uploaded images
5. **View Results**: See detailed metadata for each analyzed image

## Project Structure

```
.
├── src/
│   ├── App.tsx          - Main component with all functionality
│   ├── App.css          - Styling for the application
│   ├── index.css        - Global styles
│   └── main.tsx         - React entry point
├── index.html           - HTML template
├── package.json         - Dependencies and scripts
├── tsconfig.json        - TypeScript configuration
├── vite.config.ts       - Vite configuration
└── README.md            - This file
```

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Axios** - HTTP client for API calls
- **OpenAI API** - Vision model for image analysis

## API Information

This application uses the `gpt-4-vision-preview` model from OpenAI, which analyzes images and returns structured data about:

- Item identification
- Visual descriptions
- Product categories
- Physical characteristics (color, material)
- Brand information
- Condition assessment
- Value estimation

## Limitations

- Maximum 4 images per session
- Image file size limits apply (check OpenAI documentation)
- API usage incurs costs based on OpenAI's pricing
- Requires internet connection for API communication

## Troubleshooting

### "Cannot find module" errors
Make sure to run `npm install` to install all dependencies.

### API key not working
- Verify the key starts with `sk-`
- Ensure you have Vision API access enabled on your OpenAI account
- Check your account has available credits

### Images not uploading
- Check file format (JPEG, PNG, GIF, WebP supported)
- Verify file size is reasonable (<20MB recommended)
- Ensure browser permissions allow file access

## Contributing

Feel free to modify and extend this application as needed.

## License

This project is open source and available for personal and commercial use.

## Support

For issues with the OpenAI API, visit [OpenAI Documentation](https://platform.openai.com/docs)

For Vite issues, visit [Vite Documentation](https://vitejs.dev)
