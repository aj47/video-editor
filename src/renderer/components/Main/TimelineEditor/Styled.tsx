import styled from 'styled-components';

export const Container = styled.div`
  padding: 16px 0;
  background: ${({ theme }) => theme.color.bgSecondary};
  border-radius: 8px;
`;

export const Canvas = styled.canvas`
  width: 100%;
  height: 60px;
`;
