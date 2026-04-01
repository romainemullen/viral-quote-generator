module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { quote, platform = 'facebook', style = 'motivational' } = req.body;
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) return res.status(500).json({ error: 'Replicate API token not configured' });

    const response = await fetch('https://api.replicate.com/v1/models/meta/llama-3-70b-instruct/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          prompt: `You are a viral content expert. Analyze this quote for viral potential on ${platform}. Quote: "${quote}". Output JSON with: viralScore (1-10), strengths (array), weaknesses (array), improvedVersions (3 versions with quote + why), bestPlatform, bestPostingTime, hashtags.`,
          max_tokens: 2000,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Analysis failed');
    }

    const prediction = await response.json();
    let result = null;
    let attempts = 0;
    while (attempts < 20 && !result) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${replicateToken}` }
      });
      const statusData = await statusResponse.json();
      if (statusData.status === 'succeeded') result = statusData.output;
      attempts++;
    }
    if (!result) throw new Error('Timed out');

    let analysisData;
    try {
      const jsonMatch = result.join('').match(/\{[\s\S]*\}/);
      analysisData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('Could not parse results');
    }

    return res.status(200).json({ success: true, original: quote, analysis: analysisData });

  } catch (error) {
    return res.status(500).json({ error: 'Failed: ' + error.message, details: error.message });
  }
};
