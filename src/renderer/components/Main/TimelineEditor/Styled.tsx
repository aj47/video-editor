import styled, { css } from 'styled-components';

export const Container = styled.div`
  position: relative;
  height: 140px;
  background: ${({ theme }) => theme.palette.backgroundDark};
  border-radius: 8px;
  overflow: hidden;
`;

export const Canvas = styled.canvas`
  cursor: pointer;
  image-rendering: crisp-edges;
  background: ${({ theme }) => theme.palette.backgroundDark};
`;
