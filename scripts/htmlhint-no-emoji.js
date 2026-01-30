module.exports = function (HTMLHint) {
  // Emoji regex pattern
  const emojiPattern = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

  HTMLHint.addRule({
    id: 'no-emoji',
    description: 'Emojis are not allowed in HTML',
    init: function (parser, reporter) {
      // Check text content
      parser.addListener('text', (event) => {
        const match = event.raw.match(emojiPattern);
        if (match) {
          reporter.error(
            `Unexpected emoji "${match[0]}" in text content`,
            event.line,
            event.col,
            this,
            event.raw
          );
        }
      });

      // Check comments
      parser.addListener('comment', (event) => {
        const match = event.content.match(emojiPattern);
        if (match) {
          reporter.error(
            `Unexpected emoji "${match[0]}" in comment`,
            event.line,
            event.col,
            this,
            event.raw
          );
        }
      });

      // Check attribute values
      parser.addListener('tagstart', (event) => {
        event.attrs.forEach((attr) => {
          const match = attr.value.match(emojiPattern);
          if (match) {
            reporter.error(
              `Unexpected emoji "${match[0]}" in attribute "${attr.name}"`,
              event.line,
              event.col,
              this,
              event.raw
            );
          }
        });
      });
    }
  });
};
