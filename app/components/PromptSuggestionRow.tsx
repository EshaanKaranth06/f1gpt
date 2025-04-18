interface PromptSuggestionRowProps {
    onPromptClick: (prompt: string) => void;
  }
  
  const PromptSuggestionRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
    const suggestions = [
      "Who won the Drivers Championship in 2024?",
      "du du du du MAX VERSTAPPEN",
      "Explain DRS?",
      "Which team won the 2024 Constructor's Championship",
      "Ferrari Monaco 2022 Strategy Messup",
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
