import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import styles from "./ScoreOSMD.module.css";   // <--- import styles

export default function ScoreOSMD() 
{
  const hostRef = useRef(null);
  const renderedRef = useRef(false);

  useEffect (() => 
    {
      if (!hostRef.current) return;
      if (renderedRef.current) return;
      renderedRef.current = true;

      const osmd = new OpenSheetMusicDisplay(
        hostRef.current, 
        {
          autoResize: true,
          drawTitle: false,
          drawingParameters: "compact",
        }
      );

      // load file from /public
      osmd
        .load("/sample.musicxml")
        .then(() => osmd.render())
        .catch(console.error);

      return () => 
      {
        osmd.clear();
      };
    },
    []
  );

  return (
  <div className={styles.scoreContainer}>   {/* apply CSS module */}
    <div ref={hostRef}></div>
  </div>
  );
}