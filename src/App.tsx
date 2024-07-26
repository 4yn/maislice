import { useState, useRef, useEffect } from "react";
import { SimaiConvert } from "simai.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";
import clipboard from "./clipboard";

const sentinel =
  "3-1-4-1-5-2-6-5-3-5-8-7-3-2-3-8-4-6-2-6-4-3-3-8-3-2-7-5-2-8-8-4-1-7-1-" +
  "6-3-3-7-5-1-5-8-2-7-4-4-4-5-2-3-7-8-1-6-4-6-2-8-6-2-8-8-6-2-8-3-4-8-2-" +
  "5-3-4-2-1-1-7-6-7-8-2-1-4-8-8-6-5-1-3-2-8-2-3-6-6-4-7-3-8-4-4-6-5-5-5-" + 
  "8-2-2-3-1-7-2-5-3-5-4-8-1-2-8-4-8-1-1-1-7-4-5-2-8-4-1-2-7-1-3-8-5-2-1-" +
  "1-5-5-5-6-4-4-6-2-2-4-8-5-4-3-3-8-1-6-4-4-2-8-8-1-7-5-6-6-5-3-3-4-4-6-" +
  "1-2-8-4-7-5-6-4-8-2-3-3-7-8-6-7-8-3-1-6-5-2-7-1-2-1-1";

function App() {
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  const loadFfmpeg = async () => {
    const baseURL = "./ffmpeg"; // in ./public/
    // const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
      console.log("ffmpeg", message);
    });
    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
      workerURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.worker.js`,
        "text/javascript"
      ),
    });
    setFfmpegLoaded(true);
  };

  useEffect(() => {
    loadFfmpeg();
  }, []);

  const [track, setTrack] = useState<null | File>(null);
  const [inoteText, setInoteText] = useState("");
  const [inoteNum, setInoteNum] = useState("");
  const [inoteOutput, setInoteOutput] = useState("");
  const [trackOutput, setTrackOutput] = useState<null | string>(null);
  const [trackOutputName, setTrackOutputName] = useState<string>("");

  async function process() {
    setInoteOutput("");
    setTrackOutput(null);
    setTrackOutputName("");

    let inoteTrim = inoteText.trim();
    let [_, originalInoteNum, chartText] =
      /^&inote_(\d+)=(.+)$/s.exec(inoteTrim) || [];
    if (!originalInoteNum) {
      setInoteOutput("does not begin with &inote_#=");
      return;
    }

    let curInoteNum = inoteNum;
    if (inoteNum === "") {
      curInoteNum = originalInoteNum + "001";
    }
    setInoteNum(curInoteNum);

    const chart = SimaiConvert.deserialize(
      chartText.replace(/,🔪,/g, `,${sentinel},`)
    );

    const times = [];
    for (const noteCollection of chart.noteCollections) {
      for (const note of noteCollection) {
        for (const path of note.slidePaths) {
          if (
            "3-" +
              path.segments
                .map((s) => s.vertices)
                .flat()
                .map((v) => v.index + 1)
                .join("-") ===
            sentinel
          ) {
            times.push(noteCollection.time);
          }
        }
      }
    }
    if (times.length === 0) {
      setInoteOutput("No 🔪 found");
      return;
    }
    if (times.length === 1) {
      times.push(chart.noteCollections[chart.noteCollections.length - 1].time);
    }
    const [startTime, endTime] = times;
    console.log(startTime, endTime);

    const trackOutputFilename = `music_practice_${originalInoteNum}_${startTime
      .toFixed(3)
      .replace(".", "")}.mp3`;

    const startTiming = chart.timingChanges
      .filter((t) => t.time < startTime - 0.000000001)
      .slice(-1)[0];
    if (!startTiming) {
      setInoteOutput("No timing zone found");
      return;
    }

    const chartSlice = chartText.split("🔪")[1];
    const newInoteOutput = `&lv_${curInoteNum}=0
&alias_${curInoteNum}=Practice ${originalInoteNum}:${startTime.toFixed(
      3
    )}-${endTime.toFixed(3)}
&music_${curInoteNum}=${trackOutputFilename}
&inote_${curInoteNum}=(${startTiming.tempo}){${
      startTiming.subdivisions
    }}${chartSlice}`;
    // prettier-ignore
    setInoteOutput(newInoteOutput);

    if (ffmpegLoaded && track) {
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile(
        track.name,
        await fetchFile(URL.createObjectURL(track))
      );
      await ffmpeg.exec([
        "-i",
        track.name,
        "-ss",
        startTime.toFixed(6),
        trackOutputFilename,
      ]);
      const fileData = await ffmpeg.readFile(trackOutputFilename);
      const data = new Uint8Array(fileData as ArrayBuffer);
      const trackOutputUrl = URL.createObjectURL(
        new Blob([data.buffer], { type: "audio/mpeg" })
      );
      setTrackOutput(trackOutputUrl);
      setTrackOutputName(trackOutputFilename);
    }

    clipboard(newInoteOutput);
  }

  return (
    <>
      <header className="container">
        <h1>maislice🔪</h1>
      </header>
      <main className="container">
        <div className="grid">
          <div>
            <label htmlFor="track">track.mp3</label>
          </div>
          <div>
            <input
              type="file"
              id="track"
              onChange={(e) => setTrack((e?.target?.files || [])[0] || null)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="inote-text">
            <code>&inote_#=</code> with up to 2 slice marks (<code>,🔪,</code>){" "}
            <br />
            shouldn't have anything else next to the <code>🔪</code> other than{" "}
            <code>,</code>
          </label>
          <textarea
            name="inote-num"
            id="inote-text"
            placeholder="&inote_5=... ,🔪, ... "
            value={inoteText}
            onChange={(e) => setInoteText(e.target.value)}
            rows={15}
          ></textarea>
        </div>
        <div className="grid">
          <label htmlFor="inote-num">new inote #</label>
          <input
            type="number"
            min="1"
            max="999999999"
            id="inote-num"
            value={inoteNum}
            onChange={(e) => {
              setInoteNum(e.target.value);
            }}
          />
          <button type="button" onClick={process}>
            slice!
          </button>
        </div>
        <hr />
        <div>
          <h3>output</h3>

          <div>
            {trackOutput && (
              <>
                Sliced track.mp3:
                <a href={trackOutput} download={trackOutputName}>
                  {trackOutputName}
                </a>
              </>
            )}
          </div>

          {inoteOutput && (
            <p>
              paste this at the bottom of maidata.txt, it's also been copied to
              your clipboard
            </p>
          )}
          <pre>{inoteOutput}</pre>
        </div>
        <div>
          <p>
            {ffmpegLoaded ? (
              "ffmpeg loaded"
            ) : (
              "ffmpeg failed to load, audio export won't work"
            )}
          </p>
          <p ref={messageRef}></p>
        </div>
      </main>
    </>
  );
}

export default App;
