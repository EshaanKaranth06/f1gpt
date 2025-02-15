import PromptSuggestionButton from "./PromptSuggestionButton"

const PromptSuggestionRow = ({onPromptClick}) => {

    const prompts = [
        "Who won the 2024 Driver's Championship?",
        "Who is the highest paid F1 Driver?",
        "Which team won the Constructor's Championship?",
        "What is the driver lineup for Ferrari?"
    ]
    return (
        <div className="prompt-suggestion-row">
            {prompts.map((prompt, index) => 
            <PromptSuggestionButton 
                key={`suggestion-${index}`}
                text={prompt}
                onClick={() => onPromptClick(prompt)}
            />)}
        </div>
    )
}

export default PromptSuggestionRow