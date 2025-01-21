/// <reference types="styled-components/cssprop" />

import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    palette: {
      mainAccent: string;
      mainNormal: string;
      mainSilent: string;
      textAccent: string;
      textNormal: string;
      textSilent: string;
      textHide: string;
      hover: string;
      active: string;
      backdropBlur: string;
      bgSecondary: string;
    };
  }
}
