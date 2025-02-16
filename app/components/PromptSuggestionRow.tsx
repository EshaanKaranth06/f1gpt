interface PromptSuggestionRowProps {
    onPromptClick: (prompt: string) => void;
  }
  
  const PromptSuggestionRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
    const suggestions = [
      "Who won the last F1 race?",
      "Tell me about Max Verstappen",
      "What is DRS?",
      "Which team won the 2024 Constructor's Championship"
    ];
  
    return (
      <div className="prompt-suggestion-row">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            className="prompt-suggestion-button"
            onClick={() => onPromptClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    );
  };
  
  export default PromptSuggestionRow;