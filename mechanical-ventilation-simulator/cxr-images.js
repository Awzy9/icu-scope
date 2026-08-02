/* =====================================================================
   Real chest radiographs — attribution manifest.

   Drop image files into  images/cxr/  and register them here. A registered
   image REPLACES the drawn schematic for that scenario, and its credit line
   renders underneath the film automatically.

   Every entry needs `licence` and `sourceUrl`. Without them the image is
   skipped and the schematic is shown instead — the module will not display
   a picture uncredited.

   ---------------------------------------------------------------------
   WHERE TO GET IMAGES YOU ARE ACTUALLY ALLOWED TO USE
   ---------------------------------------------------------------------
   Good:
     - Wikimedia Commons — commons.wikimedia.org. Licence is stated on each
       file page and VARIES per file; prefer Public Domain / CC0 (no
       obligations) over CC BY-SA (share-alike attaches to derivatives).
     - NIH ChestX-ray14 — nihcc.app.box.com/v/ChestXray-NIHCC. 112,120
       frontal radiographs released by the NIH Clinical Center. Read the
       README in that folder for the current terms before shipping.
     - Open-i (US National Library of Medicine) — openi.nlm.nih.gov.
       Indexes figures from open-access PubMed Central articles; the licence
       comes from the source article, so check each one.
     - PubMed Central Open Access Subset — CC BY articles are reusable with
       attribution. CC BY-NC ones are not, if this project is ever used
       commercially.
     - CDC Public Health Image Library — mostly public domain.

   Do NOT bundle:
     - Radiopaedia and LITFL — CC BY-NC-SA. The non-commercial term limits
       how this project can ever be used, share-alike would force the whole
       work under the same licence, and Radiopaedia's terms specifically
       exclude assembling numerous of their cases into comparable content.
       Link to them instead; the panel already does.
     - MIMIC-CXR, CheXpert — credentialed access under a data use agreement
       that prohibits redistribution.

   Scenario keys (must match the simulator's scenario ids):
     normal, ardsMild, ardsModerate, ardsSevere, copd, edema, pneumonia,
     fibrosis, neuromuscular, obesity, covidArds, pe, traumaFlail,
     pneumothorax, bpf
   ===================================================================== */

window.CXR_IMAGES = {

  // ---- Example (commented out) -------------------------------------
  // Copy this shape, fill in every field from the image's own file page,
  // and uncomment. Do not guess the licence — read it off the source.
  //
  // pneumothorax: {
  //   src: "images/cxr/pneumothorax.jpg",
  //   title: "Right-sided tension pneumothorax",
  //   author: "A. Author",
  //   licence: "CC BY-SA 4.0",
  //   licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  //   sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
  // },

};
