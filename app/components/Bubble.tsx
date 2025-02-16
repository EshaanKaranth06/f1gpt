interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

interface BubbleProps {
  message: Message;
}

const Bubble: React.FC<BubbleProps> = ({ message }) => {
  return (
    <div className={`bubble ${message.role}`}>
      {message.content}
    </div>
  );
};

export default Bubble;