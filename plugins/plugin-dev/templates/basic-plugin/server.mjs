import readline from 'node:readline';

const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
const input = readline.createInterface({ input: process.stdin, terminal: false });

input.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.method === 'initialize') {
    reply(message.id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'example-safe-plugin', version: '1.0.0' },
    });
  } else if (message.method === 'tools/list') {
    reply(message.id, {
      tools: [
        {
          name: 'safe_echo',
          description: 'Return text unchanged without side effects.',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      ],
    });
  } else if (message.method === 'tools/call') {
    const text = typeof message.params?.arguments?.text === 'string' ? message.params.arguments.text : '';
    reply(message.id, { content: [{ type: 'text', text }] });
  } else if (message.id !== undefined) {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })}\n`,
    );
  }
});
