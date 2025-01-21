import ReactDOM from 'react-dom';
import { ThemeProvider } from 'styled-components';
import { App } from '@renderer/components/App';
import { theme } from '@renderer/components/Styles/theme';

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <App />
  </ThemeProvider>,
  document.getElementById('root')
);
