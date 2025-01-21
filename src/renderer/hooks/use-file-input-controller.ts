import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { videoBlocksState } from '@recoil/atoms/timeline';
import { useDropzone } from 'react-dropzone';

import { getFilename } from '@renderer/util';

import { useSetFileState } from './use-set-file-state';

export const useFileInputController = () => {
  const setFileState = useSetFileState();

  const inspectAndSetFileState = useCallback(
    async (filePath: string) => {
      if (filePath === '') return;

      const result = await window.api.inspectFile(filePath);
      if (result === undefined) {
        // eslint-disable-next-line no-alert
        alert(`${getFilename(filePath)} is invalid file.`);
        return;
      }

      setFileState(filePath, result);
    },
    [setFileState]
  );

  const setVideoBlocks = useSetRecoilState(videoBlocksState);

  const onDrop = useCallback(
    async (files: File[]) => {
      setVideoBlocks([]);
      setCurrentBlockIndex(-1);
      if (files.length < 1) return;

      const filePath = files[0].path;
      inspectAndSetFileState(filePath);
    },
    [inspectAndSetFileState]
  );

  const dropzoneState = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return { ...dropzoneState, inspectAndSetFileState };
};
