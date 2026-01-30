import stylelint from 'stylelint';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions }
} = stylelint;

const ruleName = 'plugin/no-emoji';

const messages = ruleMessages(ruleName, {
  rejected: 'Unexpected emoji in CSS comment'
});

const meta = {
  url: 'https://github.com/user/sticky-notes-chrome-extension'
};

// Emoji regex pattern
const emojiPattern = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

/** @type {import('stylelint').Rule} */
const ruleFunction = (primary) => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primary,
      possible: [true]
    });

    if (!validOptions) return;

    // Check comments
    root.walkComments((comment) => {
      const { text } = comment;
      const match = text.match(emojiPattern);

      if (match) {
        report({
          result,
          ruleName,
          message: messages.rejected,
          node: comment,
          word: match[0]
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
