module.exports = {
  presets: [
    '@babel/preset-env',
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/typescript',
  ],
  plugins: ['babel-plugin-styled-components'],
};
