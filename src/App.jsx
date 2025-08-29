import ScoreOSMD from "./ScoreOSMD";

export default function App() {
  return (
    <main style={{ margin: 24 }}>
      <h1>Music Viewer v0</h1>
      <ScoreOSMD src="./sample.musicxml" />
    </main>
  );
}