# AI Dataset Preprocessor 🚀

A simple web application to preprocess datasets using Gemini AI. Upload your CSV, JSON, or text files and transform them using natural language prompts.

## Features

- 📁 **File Upload**: Drag & drop or browse to upload CSV, JSON, or TXT files
- ✨ **AI Processing**: Use natural language to describe transformations
- 📊 **Live Preview**: See original and processed data side by side
- 💾 **Export**: Download processed data as CSV, JSON, or TXT

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API Key:**
   - Copy `.env.example` to `.env`
   - Add your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Run the application:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3000`

## Example Prompts

Try these prompts with your datasets:

- "Remove all duplicate rows"
- "Remove rows where age is less than 18"
- "Add a new column 'full_name' by combining 'first_name' and 'last_name'"
- "Convert all dates to YYYY-MM-DD format"
- "Normalize the 'price' column to be between 0 and 1"
- "Sort by the 'date' column in descending order"
- "Remove columns that have more than 50% null values"
- "Convert text to lowercase and remove special characters"

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **AI**: Google Gemini 1.5 Flash
- **File Handling**: Multer

## Project Structure

```
├── server.js          # Express backend
├── public/
│   ├── index.html     # Main HTML
│   ├── styles.css     # Styling
│   └── app.js         # Frontend logic
├── package.json
├── .env.example
└── README.md
```

## License

MIT
