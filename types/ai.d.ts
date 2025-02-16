declare module '@ai-sdk/deepinfra' {
    export interface DeepInfraConfig {
      apiKey: string;
    }
    
    export function createDeepInfra(config: DeepInfraConfig): any;
  }
  
  declare module 'ai' {
    export interface Message {
      id?: string;
      role: 'system' | 'user' | 'assistant';
      content: string;
      createdAt?: Date;
    }
  
    export interface StreamTextResult {
      textStream: AsyncIterable<string>;
    }
  
    export function streamText(config: {
      model: any;
      messages: Message[];
    }): StreamTextResult;
  }