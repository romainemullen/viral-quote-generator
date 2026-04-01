module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { quote, style = 'minimalist', platform = 'facebook' } = req.body;
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) return res.status(500).json({ error: 'Replicate API token not configured' });

    const stylePrompts = {
      minimalist: 'minimalist design, clean typography, dark gradient background, modern',
      motivational: 'inspirational aesthetic, sunrise background, bold text, emotional',
      luxury: 'gold and black luxury design, elegant serif font, premium feel',
      street: 'urban street style, graffiti-inspired, bold colors, edgy',
      nature: 'natural landscape, forest or mountain background, peaceful'
    };

    const platformSizes = { facebook: '1024x1024', instagram: '1024x1792' };
    const selectedStyle = stylePrompts[style] || stylePrompts.minimalist;
    const size = platformSizes[platform] || '1024x1024';
    const [width, height] = size.split('x').map(Number);

    const response = await fetch('https://api.replicate.com/v1/models/stability-ai/sdxl/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          prompt: `${selectedStyle}, quote text: "${quote}", professional social media design, high quality, no watermark`,
          negative_prompt: 'blurry, low quality, distorted text, watermark',
          width: width,
          height: height,
          num_outputs: 1,
          scheduler: 'K_EULER',
          num_inference_steps: 30
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Image generation failed');
    }

    const prediction = await response.json();
    let result = null;
    let attempts = 0;
    while (attempts < 30 && !result) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${replicateToken}` }
      });
      const statusData = await statusResponse.json();
      if (statusData.status === 'succeeded') result = statusData.output[0];
      attempts++;
    }
    if (!result) throw new Error('Timed out');

    return res.status(200).json({ success: true, imageUrl: result, quote, style, platform });

  } catch (error) {
    return res.status(500).json({ error: 'Failed: ' + error.message, details: error.message });
  }
};
