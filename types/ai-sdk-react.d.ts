declare module '@ai-sdk/react' {
    export interface Message {
      id?: string;
      role: 'assistant' | 'system' | 'user';
      content: string;
      createdAt?: Date;
    }
  
    export interface UseChat {
      messages: Message[];
      isLoading: boolean;
      input: string;
      handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
      handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    }
  
    export function useChat(): UseChat;
  }