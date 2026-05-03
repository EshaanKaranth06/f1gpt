interface PromptSuggestionRowProps {
  onPromptClick: (prompt: string) => void;
}

const PromptSuggestionRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
  const suggestions = [
    "Who won the 2024 Drivers Championship?",
    "Explain DRS and how it works",
    "2024 Constructors Championship results",
    "Best overtakes of the season",
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
