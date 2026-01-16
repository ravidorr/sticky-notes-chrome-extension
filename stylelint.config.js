/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Allow CSS custom properties (variables)
    'custom-property-empty-line-before': null,
    
    // Allow class naming with BEM-style or utility classes
    'selector-class-pattern': null,
    
    // Allow @media without specific order
    'no-descending-specificity': null,
    
    // Allow empty lines for readability
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,
    
    // Allow color functions and hex - be lenient
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    'color-hex-length': null,
    
    // Allow vendor prefixes if needed
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    
    // Be lenient with font-family (allows system fonts with mixed case)
    'font-family-no-missing-generic-family-keyword': null,
    'value-keyword-case': null,
    
    // Allow shorthand properties
    'declaration-block-no-redundant-longhand-properties': null,
    
    // Comment formatting
    'comment-empty-line-before': null,
    
    // Allow import statements
    'import-notation': null,
    
    // Allow traditional media query syntax
    'media-feature-range-notation': null,
    
    // Allow multiple declarations on single line for utility classes
    'declaration-block-single-line-max-declarations': null,
    
    // Allow units on zero values (for consistency)
    'length-zero-no-unit': null,
    
    // Allow camelCase keyframe names
    'keyframes-name-pattern': null
  },
  ignoreFiles: [
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '**/*.min.css',
    '**/*.bundled.css'
  ]
};
