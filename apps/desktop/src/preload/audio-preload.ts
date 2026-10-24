import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { AUDIO_JOB_CHANNEL, AUDIO_RESULT_CHANNEL, type AudioJob, type AudioJobResult } from '../shared/bridge-types';

/** The hidden audio window only receives jobs and sends results back; it can do nothing else. */
contextBridge.exposeInMainWorld('stepsVaultAudio', {
  onJob: (handleJob: (job: AudioJob) => void) => {
    ipcRenderer.on(AUDIO_JOB_CHANNEL, (_event: IpcRendererEvent, job: AudioJob) => {
      handleJob(job);
    });
  },
  sendResult: (result: AudioJobResult) => {
    ipcRenderer.send(AUDIO_RESULT_CHANNEL, result);
  },
});
