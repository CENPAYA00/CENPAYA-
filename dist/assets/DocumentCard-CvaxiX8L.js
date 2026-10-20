import{i as a,j as t,F as n}from"./index-BPD8HxCq.js";/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=a("ExternalLink",[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=a("File",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}]]);function x(r){const e=r.toLowerCase().split("?")[0];return e.endsWith(".pdf")?{label:"PDF",color:"bg-red-500",Icon:n}:e.endsWith(".doc")||e.endsWith(".docx")?{label:"DOC",color:"bg-blue-500",Icon:n}:e.endsWith(".ppt")||e.endsWith(".pptx")?{label:"PPT",color:"bg-orange-500",Icon:n}:e.endsWith(".xls")||e.endsWith(".xlsx")?{label:"XLS",color:"bg-green-600",Icon:n}:{label:"FILE",color:"bg-gray-600",Icon:d}}function p({url:r,name:e}){const{label:s,color:o,Icon:l}=x(r),i=e||decodeURIComponent(r.split("/").pop()||"Document");return t.jsxs("a",{href:r,target:"_blank",rel:"noreferrer",className:"flex items-center gap-3 bg-gray-50 dark:bg-darkbg rounded-xl p-3 mb-2 border border-gray-100 dark:border-darkline active:bg-gray-100",children:[t.jsx("div",{className:`w-10 h-10 ${o} rounded-lg flex items-center justify-center text-white shrink-0`,children:t.jsx(l,{size:18})}),t.jsxs("div",{className:"flex-1 min-w-0",children:[t.jsx("p",{className:"text-[11px] font-bold text-navy dark:text-white truncate",children:i}),t.jsxs("p",{className:"text-[9px] text-gray-500",children:[s," document"]})]}),t.jsx(c,{size:14,className:"text-gray-400 shrink-0"})]})}export{p as D};
