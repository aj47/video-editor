import styled from 'styled-components';

import { isDarwin } from '@shared/util';

export const ModalContainer = styled.div`
  background: ${({ theme }) => theme.palette.background};
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  max-width: 500px;
`;

export const ModalHeader = styled.h3`
  margin: 0 0 16px;
  font-size: 18px;
`;

export const ShortcutList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
`;

export const ShortcutKey = styled.dt`
  font-weight: bold;
  color: ${({ theme }) => theme.palette.primary};
`;

export const ShortcutDesc = styled.dd`
  margin: 0;
`;

export const Container = styled.div<{ isVisible: boolean }>`
  position: absolute;
  top: ${isDarwin ? '52px' : '82px'};
  left: 0;
  width: 100%;
  height: calc(100% - ${isDarwin ? '52px' : '82px'});
  background-color: rgba(0, 0, 0, 0.3);
  opacity: ${({ isVisible: visible }) => (visible ? '1' : '0')};
  backdrop-filter: ${({ theme }) => theme.palette.backdropBlur};
  transition: opacity 0.2s;
  z-index: 99;
  pointer-events: none;
`;
