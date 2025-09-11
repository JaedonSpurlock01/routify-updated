import { useState, useEffect } from "react";
import { useEventListener } from "ahooks";

import { useAlgorithmContext } from "@/lib/context/context";
import { toast } from "sonner";
import { Play, StopCircle } from "lucide-react";
import { Button } from "../ui/button";

export const StartButton = () => {
  const { startNode, endNode, isStopped, setIsStopped, setIsAlgorithmReady } =
    useAlgorithmContext();

  const [isClickProcessing, setIsClickProcessing] = useState(false);

  useEffect(() => {
    if (!endNode || !startNode) {
      setIsStopped(true);
      setIsAlgorithmReady(false);
    }
  }, [startNode, endNode, setIsAlgorithmReady, setIsStopped]);

  // Register mouse enter and leave events
  useEventListener("keypress", (e) => {
    if (e.key === " ") {
      handleButtonToggle();
    }
  });

  const handleButtonToggle = () => {
    if (isClickProcessing) return;

    setIsClickProcessing(true);

    if (!startNode) {
      toast("Double click on the map to select your starting point", {
        style: {
          background: "#262626",
          borderRadius: "50px",
          borderColor: "#404040",
          color: "#fff",
        },
        duration: 5000,
        icon: "🛈",
      });
    } else if (!endNode) {
      toast("Double click on the map to select your ending point", {
        style: {
          background: "#262626",
          borderRadius: "50px",
          borderColor: "#404040",
          color: "#fff",
        },
        duration: 5000,
        icon: "🛈",
      });
    } else if (!isStopped) {
      setIsStopped(true);
      setIsAlgorithmReady(false);
    } else {
      toast("Finding a path", {
        style: {
          background: "#262626",
          borderRadius: "50px",
          borderColor: "#404040",
          color: "#fff",
        },
        duration: 5000,
        icon: "🛈",
      });
      setIsStopped(false);
      setIsAlgorithmReady(true);
    }

    setIsClickProcessing(false);
  };

  return isStopped ? (
    <Button
      onClick={handleButtonToggle}
      size="icon"
      className="rounded-full bg-[#46b780] hover:bg-[#4dcc8e] text-neutral-100 size-12 border border-border"
    >
      <Play fill="#fff" />
    </Button>
  ) : (
    <Button
      onClick={handleButtonToggle}
      size="icon"
      className="rounded-full bg-[#ff4252] hover:bg-[#ff5463] size-12 border border-border"
    >
      <StopCircle fill="#fff" className="text-white" />
    </Button>
  );
};
