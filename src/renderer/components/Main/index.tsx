import { useFileInputController } from '@hooks/use-file-input-controller';

import { ConvertStatusModal } from './ConvertStatusModal';
import { DropNavigationModal } from './DropNavigationModal';
import { Editor } from './Editor';
import { TimelineEditor } from './TimelineEditor';
import * as Styled from './Styled';

export const Main = () => {
  const { getRootProps, isDragActive } = useFileInputController();

  return (
    <Styled.Container {...(getRootProps() as any)}>
      <Editor />
      <TimelineEditor />

      <ConvertStatusModal />
      <DropNavigationModal isVisible={isDragActive} />
    </Styled.Container>
  );
};
