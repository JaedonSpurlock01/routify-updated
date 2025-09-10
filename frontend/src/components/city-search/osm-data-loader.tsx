import { useCDNQuery, useOSMQuery } from "@/api/osm";
import { useState, useEffect } from "react";
import { Progress } from "../ui/progress";
import { Loader2 } from "lucide-react";
import { useThreeContext } from "@/lib/context/context";
import { useNavigate } from "react-router-dom";

export function OSMDataLoader({
  osm_id,
  osm_name,
  osm_type,
}: {
  osm_id: number;
  osm_name: string;
  osm_type: string;
}) {
  const [startDownload, setStartDownload] = useState(false);
  const { setParsedLineData } = useThreeContext();

  const navigate = useNavigate();

  const {
    data: job,
    isPending: jobLoading,
    isError: jobError,
    error,
  } = useOSMQuery(osm_id, osm_type);
  const {
    data: elements,
    progress,
    bytes,
    isSuccess,
  } = useCDNQuery(job?.url ?? "", startDownload);

  // Start downloading NDJSON once job is success
  useEffect(() => {
    if (job?.status === "success") setStartDownload(true);
  }, [job]);

  // Save the parsed line data and redirect user to map
  useEffect(() => {
    if (elements) {
      setParsedLineData(elements);
      navigate("/map", { replace: true });
    }
    // eslint-disable-next-line
  }, [isSuccess]);

  function formatBytes(bytes: number) {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(2)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  if (jobLoading) return <p>Checking job status...</p>;
  if (jobError) return <p>Error checking job: {error.message}</p>;
  if (job?.status === "processing")
    return (
      <div className="flex gap-2 items-center">
        <Loader2 className="animate-spin" />
        <p className="text-sm text-primary/80">Processing… please wait</p>
      </div>
    );
  if (job?.status === "failure")
    return <p className="text-red-500">Failed: {job.error}</p>;

  return (
    <div className="p-4 space-y-4">
      {!elements && (
        <>
          <p className="text-sm text-primary/80 text-center">
            Loading {osm_name}
          </p>
          <Progress value={progress} className="w-[300px]" />
          <p className="text-sm text-muted-foreground text-center">
            Loaded {formatBytes(bytes)}...
          </p>
        </>
      )}
    </div>
  );
}
