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
    console.log('=== AI API CALLED ===');
    
    const { prompt, type, content } = req.body;
    
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('API Key available:', !!apiKey);
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not found in environment variables'
      });
    }
    
    let systemPrompt = '';
    let maxTokens = 500;
    
    // Different prompts for different AI tasks
    switch (type) {
      case 'extract':
        systemPrompt = `You are a meeting data extraction expert. Analyse the provided content and extract meeting details using British English conventions.

Look for:
- Meeting title in filename or document header
- Date in YYYY-MM-DD format from filename or content
- Time in HH:MM format from timestamps or content
- Location mentions (conference rooms, cities, virtual platforms)
- Client name or organisation mentioned
- Project name or identifier
- Attendee names mentioned in conversation

Return ONLY a JSON object with this exact structure:
{
  "title": "extracted meeting title or null",
  "date": "YYYY-MM-DD format or null", 
  "time": "HH:MM format or null",
  "location": "meeting location or null",
  "client": "client name or organisation or null",
  "project": "project name or identifier or null",
  "attendees": "comma-separated attendees or null"
}

For the title, prefer meaningful topics from filename over generic phrases.
For transcripts, extract the main business purpose discussed.

Return ONLY valid JSON, no explanations or markdown.`;
        maxTokens = 400;
        break;
        
      case 'summarize':
        systemPrompt = `You are a professional meeting minutes assistant. Create a comprehensive summary in clear, readable format using British English spelling and terminology throughout.

CRITICAL: You MUST use British English conventions including:
- "organisation" not "organization"
- "analyse" not "analyze" 
- "prioritise" not "prioritize"
- "realise" not "realize"
- "behaviour" not "behavior"
- "colour" not "color"
- "centre" not "center"
- "licence" (noun) / "license" (verb)
- Use "whilst" instead of "while" where appropriate
- Use "amongst" instead of "among" where appropriate

Structure your response as follows:

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

Use professional British English throughout. Focus on extracting real information from the content provided, not generic templates. Ensure all terminology, spelling, and phrasing follows British conventions consistently.`;
        maxTokens = 2500;
        break;
        
      case 'query':
        systemPrompt = `You are a meeting analysis assistant using British English. Answer the user's question about the provided meeting data using British spelling and terminology (organisation, analyse, prioritise, etc.). Be specific and reference actual meeting content when possible. If the information isn't available in the meetings provided, say so clearly.

Format your response in a clear, professional manner with bullet points or structured text as appropriate. Use British English throughout your response.`;
        maxTokens = 800;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid AI task type' });
    }

    const fullPrompt = `${systemPrompt}\n\nContent to analyse:\n${content || prompt}`;
    console.log('Prompt type:', type, 'Content length:', (content || prompt).length);

    // Use the correct Gemini 2.0 Flash model
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      generationConfig: {
        temperature: type === 'extract' ? 0.1 : 0.7,
        maxOutputTokens: maxTokens,
        topP: 0.8,
        topK: 10
      }
    };

    console.log('🚀 Calling Gemini API for type:', type);
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Gemini response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', errorText);
      return res.status(500).json({ 
        error: 'Gemini API failed',
        details: `Status ${response.status}: ${errorText}`
      });
    }

    const data = await response.json();
    console.log('Got response from Gemini');
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid Gemini response structure');
      return res.status(500).json({ 
        error: 'Invalid response structure from Gemini',
        response: data
      });
    }

    const result = data.candidates[0].content.parts[0].text;
    console.log('Result length:', result.length);
    
    // For extraction, try to parse JSON
    if (type === 'extract') {
      try {
        // Clean up the result in case it has markdown formatting
        let cleanResult = result.trim();
        
        // Remove markdown code block formatting if present
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.replace(/```json\s*/, '').replace(/```\s*$/, '');
        } else if (cleanResult.startsWith('```')) {
          cleanResult = cleanResult.replace(/```\s*/, '').replace(/```\s*$/, '');
        }
        
        console.log('Attempting to parse extraction result:', cleanResult);
        const extractedData = JSON.parse(cleanResult);
        console.log('✅ Successfully parsed extraction JSON:', extractedData);
        return res.json({ result: extractedData });
      } catch (parseError) {
        console.error('❌ Failed to parse extraction result as JSON:', parseError);
        console.error('Raw result:', result);
        
        // Try to extract manually if JSON parsing fails
        const title = result.match(/"title":\s*"([^"]+)"/)?.[1] || null;
        const date = result.match(/"date":\s*"([^"]+)"/)?.[1] || null;
        const time = result.match(/"time":\s*"([^"]+)"/)?.[1] || null;
        const location = result.match(/"location":\s*"([^"]+)"/)?.[1] || null;
        const client = result.match(/"client":\s*"([^"]+)"/)?.[1] || null;
        const project = result.match(/"project":\s*"([^"]+)"/)?.[1] || null;
        const attendees = result.match(/"attendees":\s*"([^"]+)"/)?.[1] || null;
        
        return res.json({ 
          result: {
            title,
            date,
            time,
            location,
            client,
            project,
            attendees
          }
        });
      }
    }

    console.log('✅ Returning result for type:', type);
    return res.json({ result });

  } catch (error) {
    console.error('❌ Unexpected error in AI API:', error);
    return res.status(500).json({ 
      error: 'Unexpected error in AI processing',
      details: error.message
    });
  }
}
        
      case 'query':
        systemPrompt = `You are a meeting analysis assistant. Answer the user's question about the provided meeting data. Be specific and reference actual meeting content when possible. If the information isn't available in the meetings provided, say so clearly.

Format your response in a clear, professional manner with bullet points or structured text as appropriate.`;
        maxTokens = 800;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid AI task type' });
    }

    const fullPrompt = `${systemPrompt}\n\nContent to analyse:\n${content || prompt}`;
    console.log('Prompt type:', type, 'Content length:', (content || prompt).length);

    // Use the correct Gemini 2.0 Flash model
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      generationConfig: {
        temperature: type === 'extract' ? 0.1 : 0.7,
        maxOutputTokens: maxTokens,
        topP: 0.8,
        topK: 10
      }
    };

    console.log('🚀 Calling Gemini API for type:', type);
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Gemini response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', errorText);
      return res.status(500).json({ 
        error: 'Gemini API failed',
        details: `Status ${response.status}: ${errorText}`
      });
    }

    const data = await response.json();
    console.log('Got response from Gemini');
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid Gemini response structure');
      return res.status(500).json({ 
        error: 'Invalid response structure from Gemini',
        response: data
      });
    }

    const result = data.candidates[0].content.parts[0].text;
    console.log('Result length:', result.length);
    
    // For extraction, try to parse JSON
    if (type === 'extract') {
      try {
        // Clean up the result in case it has markdown formatting
        let cleanResult = result.trim();
        
        // Remove markdown code block formatting if present
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.replace(/```json\s*/, '').replace(/```\s*$/, '');
        } else if (cleanResult.startsWith('```')) {
          cleanResult = cleanResult.replace(/```\s*/, '').replace(/```\s*$/, '');
        }
        
        console.log('Attempting to parse extraction result:', cleanResult);
        const extractedData = JSON.parse(cleanResult);
        console.log('✅ Successfully parsed extraction JSON:', extractedData);
        return res.json({ result: extractedData });
      } catch (parseError) {
        console.error('❌ Failed to parse extraction result as JSON:', parseError);
        console.error('Raw result:', result);
        
        // Try to extract manually if JSON parsing fails
        const title = result.match(/"title":\s*"([^"]+)"/)?.[1] || null;
        const date = result.match(/"date":\s*"([^"]+)"/)?.[1] || null;
        const time = result.match(/"time":\s*"([^"]+)"/)?.[1] || null;
        const location = result.match(/"location":\s*"([^"]+)"/)?.[1] || null;
        const client = result.match(/"client":\s*"([^"]+)"/)?.[1] || null;
        const project = result.match(/"project":\s*"([^"]+)"/)?.[1] || null;
        const attendees = result.match(/"attendees":\s*"([^"]+)"/)?.[1] || null;
        
        return res.json({ 
          result: {
            title,
            date,
            time,
            location,
            client,
            project,
            attendees
          }
        });
      }
    }

    console.log('✅ Returning result for type:', type);
    return res.json({ result });

  } catch (error) {
    console.error('❌ Unexpected error in AI API:', error);
    return res.status(500).json({ 
      error: 'Unexpected error in AI processing',
      details: error.message
    });
  }
}
