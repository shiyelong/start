/**
 * Screen capture module — screenshots and screen recording.
 *
 * - Screenshot: capture canvas as PNG, trigger download
 * - Recording: MediaRecorder API for Canvas + audio as WebM
 * - Handle unsupported browsers gracefully
 *
 * Requirements: 19.1-19.6
 */

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export function captureScreenshot(
  canvas: HTMLCanvasElement,
  platform: string,
  romTitle: string,
): void {
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `${platform}_${romTitle}_${timestamp}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    // Canvas tainted or other error — silently fail
  }
}

// ---------------------------------------------------------------------------
// Screen Recorder
// ---------------------------------------------------------------------------

export class ScreenRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private _isRecording = false;
  private platform = '';
  private romTitle = '';

  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Start recording the canvas (and optionally audio).
   * Returns false if MediaRecorder is not supported.
   */
  start(
    canvas: HTMLCanvasElement,
    platform: string,
    romTitle: string,
    audioContext?: AudioContext,
    audioSource?: MediaStreamAudioSourceNode,
  ): boolean {
    if (!isMediaRecorderSupported()) return false;
    if (this._isRecording) return true;

    this.platform = platform;
    this.romTitle = romTitle;
    this.chunks = [];

    try {
      const videoStream = canvas.captureStream(60);

      // Merge audio if available
      let combinedStream = videoStream;
      if (audioContext && audioSource) {
        const dest = audioContext.createMediaStreamDestination();
        audioSource.connect(dest);
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) {
          combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            audioTrack,
          ]);
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.downloadRecording();
      };

      this.mediaRecorder.start(1000); // collect data every second
      this._isRecording = true;
      return true;
    } catch {
      this._isRecording = false;
      return false;
    }
  }

  /** Stop recording and trigger download. */
  stop(): void {
    if (!this._isRecording || !this.mediaRecorder) return;
    this._isRecording = false;
    try {
      this.mediaRecorder.stop();
    } catch {
      // Already stopped
    }
  }

  private downloadRecording(): void {
    if (this.chunks.length === 0) return;
    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `${this.platform}_${this.romTitle}_${timestamp}.webm`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.chunks = [];
  }
}
