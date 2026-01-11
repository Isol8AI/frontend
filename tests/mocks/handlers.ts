import { http, HttpResponse } from 'msw';

const API_BASE = 'http://localhost:8000/api/v1';

export const handlers = [
  // GET /chat/models - Public endpoint
  http.get(`${API_BASE}/chat/models`, () => {
    return HttpResponse.json([
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
      { id: 'google/gemma-2-2b-it', name: 'Gemma 2 2B' },
    ]);
  }),

  // POST /users/sync
  http.post(`${API_BASE}/users/sync`, () => {
    return HttpResponse.json({
      status: 'exists',
      user_id: 'user_test_123',
    });
  }),

  // GET /chat/sessions
  http.get(`${API_BASE}/chat/sessions`, () => {
    return HttpResponse.json([
      {
        id: 'session_1',
        name: 'Test Conversation',
        created_at: new Date().toISOString(),
      },
      {
        id: 'session_2',
        name: 'Another Chat',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ]);
  }),

  // GET /chat/sessions/:id/messages
  http.get(`${API_BASE}/chat/sessions/:sessionId/messages`, ({ params }) => {
    const { sessionId } = params;

    if (sessionId === 'session_1') {
      return HttpResponse.json([
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello!',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Hi there! How can I help you today?',
          model_used: 'Qwen/Qwen2.5-72B-Instruct',
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    return HttpResponse.json([]);
  }),

  // POST /chat/stream - SSE streaming response
  http.post(`${API_BASE}/chat/stream`, async () => {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Session event
        controller.enqueue(
          encoder.encode('data: {"type":"session","session_id":"session_new"}\n\n')
        );

        // Content chunks
        const chunks = ['Hello', '! How ', 'can I ', 'help you', ' today?'];
        chunks.forEach((chunk) => {
          controller.enqueue(
            encoder.encode(`data: {"type":"content","content":"${chunk}"}\n\n`)
          );
        });

        // Done event
        controller.enqueue(
          encoder.encode('data: {"type":"done"}\n\n')
        );

        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }),
];
