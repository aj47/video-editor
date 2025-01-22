import styled, { css } from 'styled-components';

export const Container = styled.div`
  position: relative;
  padding: 16px 0;
  margin-top: 40px;
  border-radius: 8px;
  z-index: 50;
  background: ${({ theme }) => theme.palette.background};
  border: 1px solid ${({ theme }) => theme.palette.border};
`;

export const TimelineTrack = styled.div`
  position: relative;
  height: 48px;
  margin: 0 40px;
  border-radius: 4px;
  background: ${({ theme }) => theme.palette.backgroundDark};
  border-bottom: 2px solid ${({ theme }) => theme.palette.border};
`;

export const LabelText = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  pointer-events: none;
  user-select: none;
`;

export const ResizeHandle = styled.div<{ $side: 'left' | 'right' }>`
  position: absolute;
  ${({ $side }) => $side}: -6px;
  top: 50%;
  width: 12px;
  height: 24px;
  transform: translateY(-50%);
  cursor: col-resize;
  background: ${({ theme }) => theme.palette.background};
  border: 2px solid ${({ theme }) => theme.palette.border};
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.palette.primary};
    ${({ $side }) => $side}: -8px;
    width: 16px;
  }
`;

export const Block = styled.div<{
  $width: number;
  $left: number;
  $active: boolean;
}>`
  position: absolute;
  height: 24px;
  top: 12px;
  width: ${({ $width }) => $width}%;
  left: ${({ $left }) => $left}%;
  border-radius: 4px;
  background: ${({ $active, theme }) => 
    $active ? theme.palette.success : theme.palette.error};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: scaleY(1.1);
    z-index: 2;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 0;
    right: 0;
    height: 4px;
    background: currentColor;
    opacity: 0.3;
  }
`;

export const TimelineScale = styled.div<{ $duration: number }>`
  position: absolute;
  top: -24px;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  justify-content: space-between;
  padding: 0 8px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 4px;
    background: ${({ theme }) => theme.palette.border};
  }

  ${({ $duration }) => {
    const marks = [];
    for (let i = 0; i <= $duration; i += 5) {
      marks.push(`
        &::after {
          content: '${i}s';
          position: absolute;
          left: ${(i / $duration) * 100}%;
          transform: translateX(-50%);
          font-size: 12px;
          color: ${({ theme }) => theme.palette.textSecondary};
        }
      `);
    }
    return css`${marks.join('')}`;
  }}
`;
