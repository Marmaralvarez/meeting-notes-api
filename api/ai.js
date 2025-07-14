export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, type, content } = req.body;
    
    let systemPrompt = '';
    let maxTokens = 500;
    
    // Different prompts for different AI tasks
    switch (type) {
      case 'extract':
        systemPrompt = `You are a meeting data extraction expert. Extract meeting details from the provided content and return ONLY a JSON object with this exact structure:

{
  "title": "extracted meeting title or null",
  "date": "YYYY-MM-DD format or null", 
  "time": "HH:MM format or null",
  "location": "meeting location or null",
  "attendees": "comma-separated attendees or null"
}

Rules:
- Return ONLY valid JSON, no other text
- Use null for any field you cannot extract
- For title, prefer meaningful meeting topics over generic phrases
- For transcripts, analyze the conversation context for the meeting purpose
- Extract email addresses as attendees if no other attendee info available`;
        maxTokens = 300;
        break;
        
      case 'summarize':
        systemPrompt = `You are a professional meeting minutes assistant. Create a comprehensive, professional summary in British English using this structure:

# Meeting Summary: [Title]

## Meeting Overview
Brief overview of the meeting's purpose and main topics discussed.

## Key Decisions Made
- List the main decisions made during the meeting
- Include specific agreements or approvals

## Action Items
| Assignee | Task Description | Due Date | Priority | Status |
|----------|------------------|----------|----------|--------|
| [Name] | [Specific task] | [Date or TBD] | [High/Medium/Low] | [Not Started] |

## Discussion Points & Strategic Insights
**Key Topics Discussed:**
- Main discussion themes and important points raised
- Strategic insights and considerations

**Technical/Operational Notes:**
- Technical details discussed
- Operational considerations

## Financial & Resource Implications
- Budget considerations mentioned
- Resource allocation discussions
- Cost implications

## Next Steps & Follow-up Actions
- Planned next steps
- Follow-up meetings scheduled
- Documentation to be prepared

## Outstanding Issues
- Unresolved items requiring attention
- Pending decisions or approvals needed

Write in a professional, British English style suitable for corporate documentation.`;
        maxTokens = 2000;
        break;
        
      case 'query':
        systemPrompt = `You are a meeting analysis assistant. Answer the user's question about the provided meeting data. Be specific and reference actual meeting content when possible. If the information isn't available in the meetings provided, say so clearly.

Format your response in a clear, professional manner with bullet points or structured text as appropriate.`;
        maxTokens = 800;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid AI task type' });
    }

    const fullPrompt = `${systemPrompt}\n\nContent to analyze:\n${content || prompt}`;

    // Call Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          temperature: type === 'extract' ? 0.1 : 0.7,
          maxOutputTokens: maxTokens,
          topP: 0.8,
          topK: 10
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Error:', errorData);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response from Gemini API');
    }

    const result = data.candidates[0].content.parts[0].text;
    
    // For extraction, try to parse JSON
    if (type === 'extract') {
      try {
        const extractedData = JSON.parse(result);
        return res.json({ result: extractedData });
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw result:', result);
        // Return a safe default if JSON parsing fails
        return res.json({ 
          result: {
            title: null,
            date: null,
            time: null,
            location: null,
            attendees: null
          }
        });
      }
    }

    return res.json({ result });

  } catch (error) {
    console.error('AI API Error:', error);
    return res.status(500).json({ 
      error: 'AI processing failed',
      details: error.message 
    });
  }
}
