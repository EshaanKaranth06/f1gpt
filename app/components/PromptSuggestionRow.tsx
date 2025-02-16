interface PromptSuggestionRowProps {
    onPromptClick: (prompt: string) => void;
  }
  
  const PromptSuggestionRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
    const suggestions = [
      "Who won the 2024 Driver's Championship?",
      "du du du du MAX VERSTAPPEN",
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