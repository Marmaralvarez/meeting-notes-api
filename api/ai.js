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
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { prompt, type, content } = req.body;
    
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('API Key available:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    console.log('API Key ends with:', apiKey ? apiKey.slice(-6) : 'N/A');
    
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
        systemPrompt = `Extract meeting details and return ONLY a JSON object:
{
  "title": "meeting title or null",
  "date": "YYYY-MM-DD or null", 
  "time": "HH:MM or null",
  "location": "location or null",
  "attendees": "attendees or null"
}

Return ONLY valid JSON, no explanations.`;
        maxTokens = 300;
        break;
        
      case 'summarize':
        systemPrompt = `Create a professional meeting summary in British English with sections for Overview, Key Decisions, Action Items, Discussion Points, Next Steps, and Outstanding Issues. Format it clearly with headings.`;
        maxTokens = 2000;
        break;
        
      case 'query':
        systemPrompt = `Answer the user's question about the meeting data provided. Be specific and reference actual content when possible.`;
        maxTokens = 800;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid AI task type' });
    }

    const fullPrompt = `${systemPrompt}\n\nContent to analyze:\n${content || prompt}`;
    console.log('Generated prompt length:', fullPrompt.length);

    // Use the correct Gemini 2.0 Flash model as shown in Google's documentation
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    console.log('Using Gemini URL (key masked):', geminiUrl.replace(apiKey, 'MASKED_KEY'));

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
    
    console.log('Request body structure:', {
      contentsLength: requestBody.contents.length,
      textLength: requestBody.contents[0].parts[0].text.length,
      generationConfig: requestBody.generationConfig
    });

    // Call Google Gemini API
    console.log('🚀 Calling Gemini 2.0 Flash API...');
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Gemini response status:', response.status);
    console.log('Gemini response ok:', response.ok);

    const responseText = await response.text();
    console.log('Gemini raw response length:', responseText.length);
    console.log('Gemini raw response preview:', responseText.substring(0, 200) + '...');

    if (!response.ok) {
      console.error('❌ Gemini API Error!');
      console.error('Status:', response.status);
      console.error('Response:', responseText);
      
      return res.status(500).json({ 
        error: 'Gemini API failed',
        details: `Status ${response.status}: ${responseText}`,
        debug: {
          status: response.status,
          apiKeyLength: apiKey ? apiKey.length : 0,
          apiKeyValid: apiKey ? apiKey.startsWith('AIza') : false,
          model: 'gemini-2.0-flash'
        }
      });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response as JSON');
      return res.status(500).json({ 
        error: 'Invalid JSON response from Gemini',
        details: responseText.substring(0, 500)
      });
    }
    
    console.log('Parsed Gemini data structure:', {
      hasCandidates: !!data.candidates,
      candidatesLength: data.candidates ? data.candidates.length : 0,
      firstCandidateHasContent: data.candidates && data.candidates[0] && !!data.candidates[0].content
    });
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid Gemini response structure');
      return res.status(500).json({ 
        error: 'Invalid response structure from Gemini',
        response: data
      });
    }

    const result = data.candidates[0].content.parts[0].text;
    console.log('✅ Got result from Gemini (length):', result.length);
    console.log('✅ Result preview:', result.substring(0, 100) + '...');
    
    // For extraction, try to parse JSON
    if (type === 'extract') {
      try {
        const extractedData = JSON.parse(result);
        console.log('✅ Successfully parsed extraction JSON:', extractedData);
        return res.json({ result: extractedData });
      } catch (parseError) {
        console.error('❌ Failed to parse extraction result as JSON:', parseError);
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

    console.log('✅ Returning successful result');
    return res.json({ result });

  } catch (error) {
    console.error('❌ Unexpected error in AI API:', error);
    return res.status(500).json({ 
      error: 'Unexpected error in AI processing',
      details: error.message,
      stack: error.stack?.substring(0, 500)
    });
  }
}
