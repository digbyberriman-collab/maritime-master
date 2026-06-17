import { pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Use the locally bundled worker so the viewer does not depend on a CDN path.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
