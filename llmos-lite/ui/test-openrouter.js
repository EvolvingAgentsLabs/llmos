// Test OpenRouter API with quantum prompt
const apiKey = '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';
const model = 'anthropic/claude-sonnet-4.5';

const messages = [
  {
    role: 'user',
    content: 'Create a quantum circuit for cepstral analysis of cardiac pressure waves'
  }
];

async function testOpenRouter() {
  console.log('Testing OpenRouter API...');
  console.log('Model:', model);
  console.log('API Key (first 20):', apiKey.substring(0, 20) + '...');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'LLMos-Lite'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false
      })
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('\n=== RESPONSE DATA ===');
    console.log('ID:', data.id);
    console.log('Model:', data.model);
    console.log('Provider:', data.provider);
    console.log('\n=== MESSAGE CONTENT ===');
    console.log(data.choices[0].message.content);
    console.log('\n=== CONTENT LENGTH ===');
    console.log('Characters:', data.choices[0].message.content.length);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOpenRouter();
