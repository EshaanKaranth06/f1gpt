import { useState, useCallback, useEffect } from 'react';
import { Message } from '@ai-sdk/react';

export function useCustomChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        setIsLoading(true);
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            createdAt: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                }),
            });

            if (!response.ok) throw new Error('Network response was not ok');
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = (accumulatedContent + chunk).split('\n');
                accumulatedContent = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed: Message = JSON.parse(data);
                            setMessages(prev => {
                                const lastMessage = prev[prev.length - 1];
                                if (lastMessage?.role === 'assistant') {
                                    // Append to existing assistant message
                                    return [
                                        ...prev.slice(0, -1),
                                        {
                                            ...lastMessage,
                                            content: lastMessage.content + parsed.content
                                        }
                                    ];
                                }
                                // Create new assistant message
                                return [...prev, parsed];
                            });
                        } catch (e) {
                            console.error('Error parsing SSE message:', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in chat:', error);
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: 'Sorry, there was an error processing your request.',
                    createdAt: new Date(),
                }
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [input, messages]);

    return {
        messages,
        input,
        isLoading,
        handleInputChange,
        handleSubmit,
    };
}