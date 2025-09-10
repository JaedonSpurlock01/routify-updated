import {
  type JobStatus,
  type OverpassNode,
  type OverpassWay,
} from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api-client";

export type OverpassElement = OverpassNode | OverpassWay;

async function fetchNDJSON(
  url: string,
  onProgress?: (progress: number) => void,
  onBytes?: (bytes: number) => void,
  onChunk?: (chunk: OverpassElement) => void
) {
  const res = await fetch(url);

  if (!res.body)
    throw new Error("ReadableStream not supported in this browser");

  const contentLength = Number(res.headers.get("Content-Length"));
  const reader = res.body.getReader();

  let received = 0;
  let buffer = "";
  const decoder = new TextDecoder("utf-8");
  const results: OverpassElement[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.length;
    if (contentLength && onProgress) {
      onProgress((received / contentLength) * 100);
      onBytes?.(received);
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    let lineBreak: number;
    while ((lineBreak = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, lineBreak).trim();
      buffer = buffer.slice(lineBreak + 1);
      if (!line) continue;

      try {
        const parsed = JSON.parse(line) as OverpassElement;
        results.push(parsed);
        onChunk?.(parsed);
      } catch (err) {
        console.warn("Failed to parse NDJSON line:", line, err);
      }
    }
  }

  // flush remaining buffer if last line doesn't end with newline
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim()) as OverpassElement;
      results.push(parsed);
      onChunk?.(parsed);
    } catch (err) {
      console.warn("Failed to parse last NDJSON line:", buffer, err);
    }
  }

  return results;
}

export function useCDNQuery(CDNUrl: string, enabled = true) {
  const [progress, setProgress] = useState(0);
  const [bytes, setBytes] = useState(0);

  const query = useQuery<OverpassElement[]>({
    queryKey: ["osm", CDNUrl],
    queryFn: () => fetchNDJSON(CDNUrl, setProgress, setBytes),
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  });

  return {
    ...query,
    progress,
    bytes,
  };
}

export function useOSMQuery(osm_id: number, osm_type: string) {
  return useQuery<JobStatus, Error>({
    queryKey: ["osm", osm_id, osm_type],
    queryFn: async () => {
      const res = await api.get<JobStatus>(`/osm/${osm_id}/${osm_type}`);
      return res.data;
    },
    refetchInterval: (query) => {
      if (query.state.data) {
        return query.state.data.status === "processing" ? 1000 : false;
      } else {
        return 1000;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
