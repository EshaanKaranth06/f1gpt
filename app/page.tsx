"use client"
import Image from "next/image";
import img from "./assets/img.png";
import Bubble from "./components/Bubble";
import LoadingBubble from "./components/LoadingBubble";
import PromptSuggestionRow from "./components/PromptSuggestionRow";
import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    console.log("💥 Chat State Updated", { isLoading, input, messages });
    scrollToBottom();
  }, [isLoading, input, messages]);

  const noMessages = messages.length === 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
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
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMessage,
                      content: parsed.content
                    }
                  ];
                }
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
  };

  const handlePrompt = async (promptText: string) => {
    setInput(promptText);
    const submitEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;
    
    await handleSubmit(submitEvent);
  };

  return (
    <main>
      <div className="chat-header">
        <Image src={img} width={150} alt="f1gpt logo" priority />
      </div>

      <section className={`chat-messages ${noMessages ? "" : "populated"}`}>
        {noMessages ? (
          <div className="welcome-container">
            <p className="starter-text">
              🏁 Welcome to F1GPT! Your ultimate Formula 1 guide. Ask me anything about drivers, races, or the latest news!
            </p>
            <PromptSuggestionRow onPromptClick={handlePrompt} />
          </div>
        ) : (
          <div className="messages-container">
            {messages.map((message: Message, index: number) => (
              <div 
                key={`message-wrapper-${index}`}
                className={`message-wrapper ${message.role}`}
              >
                <Bubble 
                  key={`message-${index}-${message.role}-${message.content.substring(0, 20)}`} 
                  message={message} 
                />
                {index === messages.length - 1 && isLoading && <LoadingBubble />}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </section>

      <form 
        className="chat-input-form"
        onSubmit={handleSubmit}
      >
        <input
          className="question-box"
          onChange={handleInputChange}
          value={input}
          placeholder="Ask me something..."
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className={`submit-button ${isLoading || !input.trim() ? 'disabled' : ''}`}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </main>
  );
};

export default Home;