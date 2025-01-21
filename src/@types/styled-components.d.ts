/// <reference types="styled-components/cssprop" />

import 'styled-components';
import { Theme } from '../renderer/components/Styles/theme';

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
