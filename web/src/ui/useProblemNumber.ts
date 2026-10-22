import { useParams } from "react-router-dom";

/** The `:number` segment of /p/:number and /p/:number/solutions, or null when it is not a decimal integer (never a request key). */
export function useProblemNumber(): number | null {
  const { number } = useParams();
  return /^\d+$/.test(number ?? "") ? Number(number) : null;
}
