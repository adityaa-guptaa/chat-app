# Toxicity Detection System

## Overview
This chat application now includes an AI-powered toxicity detection system that analyzes messages in real-time and displays warning indicators for potentially harmful content.

## Features
- **Real-time Analysis**: Every text message is analyzed for toxicity before being stored
- **Multiple Detection Methods**: Uses Google's Perspective API with keyword fallback
- **Severity Levels**: Messages are categorized into different toxicity severity levels
- **Visual Warnings**: Users see clear warning indicators on toxic messages
- **Category Detection**: Identifies specific types of harmful content (harassment, threats, etc.)

## Technical Implementation

### Backend Components

#### 1. Toxicity Analysis Library (`/backend/src/lib/toxicity.js`)
- **Perspective API Integration**: Uses Google's machine learning models trained on millions of comments
- **Fallback System**: When API is unavailable, uses keyword-based detection
- **Severity Scoring**: 
  - None: 0 - 0.5
  - Warning: 0.5 - 0.7  
  - High: 0.7 - 0.8
  - Severe: 0.8+

#### 2. Database Schema Updates (`/backend/src/models/message.model.js`)
Added toxicity object to Message schema:
```javascript
toxicity: {
  isToxic: { type: Boolean, default: false },
  toxicityScore: { type: Number, default: 0 },
  severity: { 
    type: String, 
    enum: ['none', 'warning', 'high', 'severe'], 
    default: 'none' 
  },
  categories: [{ type: String }]
}
```

#### 3. Message Processing (`/backend/src/controllers/message.controller.js`)
- Analyzes text content before saving messages
- Gracefully handles API failures with fallback
- Stores toxicity data with each message

### Frontend Components

#### 1. ToxicityWarning Component (`/frontend/src/components/ToxicityWarning.jsx`)
- Displays color-coded warning badges
- Shows severity level and confidence score
- Lists detected harmful categories

#### 2. Chat Integration (`/frontend/src/components/ChatContainer.jsx`)
- Seamlessly integrates warnings into chat interface
- Shows warnings above message content
- Maintains chat flow and usability

## API Configuration

### Perspective API Setup
1. Visit [Google Perspective API](https://developers.perspectiveapi.com/s/docs-get-started)
2. Create a Google Cloud project
3. Enable the Perspective Comment Analyzer API
4. Generate an API key
5. Add to `/backend/.env`:
```
PERSPECTIVE_API_KEY=your_actual_api_key_here
```

### Fallback System
When Perspective API is unavailable, the system uses keyword-based detection with predefined toxic word lists and scoring algorithms.

## Testing the System

### Test Endpoint
```bash
curl -X POST "http://localhost:5001/api/toxicity/test-toxicity" \
  -H "Content-Type: application/json" \
  -d '{"text": "Your test message here"}'
```

### Sample Test Cases
- **Safe Message**: "Hello, how are you today?"
- **Mild Toxicity**: "You're being annoying"
- **High Toxicity**: "I hate you, you're stupid"
- **Severe Toxicity**: Messages with threats or extreme harassment

## Warning Indicators

### Visual Design
- **Warning (Yellow)**: ⚠️ Mildly inappropriate content
- **High (Orange)**: 🛡️ Potentially harmful content  
- **Severe (Red)**: 🚨 Highly toxic content

### Information Displayed
- Severity level and confidence percentage
- Specific harmful categories detected
- Clear but non-intrusive warning messages

## Privacy & Ethics
- Analysis happens server-side for privacy
- No message content is stored by Perspective API
- Warnings inform users without censoring content
- System helps create safer communication environments

## Performance Considerations
- API calls are async and don't block message sending
- Fallback system ensures reliability
- Minimal impact on chat performance
- Graceful degradation when services are unavailable

## Future Enhancements
- Admin moderation tools
- User-configurable sensitivity levels
- Advanced filtering options
- Toxicity trend analytics
- Custom keyword lists per community

## Troubleshooting

### Common Issues
1. **API Key Not Working**: Verify key is correct and API is enabled
2. **High Latency**: Check network connection to Google's API
3. **False Positives**: Adjust scoring thresholds in toxicity.js
4. **Missing Warnings**: Check console for API errors

### Debug Mode
Enable detailed logging by checking backend console output for toxicity analysis results.