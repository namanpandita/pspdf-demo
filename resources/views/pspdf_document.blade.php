<html>
    <head>
        <link rel="stylesheet" href="{{ asset('storage/assets/pspdfkit-lib/pspdfkit-2022.2.3.css') }}">
    </head>
    <body class="antialiased">

        <div id="pspdfkit" style="height: 100vh"></div>
        <script src="assets/pspdfkit.js"></script>
        <script>
            const STORAGE_KEY = "signatures_storage";
            const ATTACHMENTS_KEY = "attachments_storage";

            var oReq = new XMLHttpRequest();
            oReq.open("GET", "http://localhost/getpdf", true);
            oReq.responseType = "blob";

            oReq.onload = function(oEvent) {
            var blob = oReq.response;
                initPSPDF(blob)
            };

            oReq.send();

            function initPSPDF(data){
                let _instance;
                const downloadButton = {
                    type: "custom",
                    id: "download-pdf",
                    title: "Download",
                    onPress: () => {
                        _instance.exportPDF({ flatten: true }).then((buffer) => {
                            const blob = new Blob([buffer], { type: "application/pdf" });
                            const fileName = "document.pdf";
                            if (window.navigator.msSaveOrOpenBlob) {
                                window.navigator.msSaveOrOpenBlob(blob, fileName);
                            } else {
                                const objectUrl = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = objectUrl;
                                a.style = "display: none";
                                a.download = fileName;
                                document.body.appendChild(a);
                                a.click();
                                URL.revokeObjectURL(objectUrl);
                                document.body.removeChild(a);
                            }
                        });
                    }
                };

                const items = PSPDFKit.defaultToolbarItems;
                // Add the download button to the toolbar.
                items.push(downloadButton);
                const documentBlobObjectUrl = URL.createObjectURL(new Blob([data], {type: "application/pdf"}))
                PSPDFKit.load({
                    container: "#pspdfkit",
                    document: documentBlobObjectUrl,
                    licenseKey: "YOUR_LICENSE_KEY_GOES_HERE",
                    toolbarItems: items,
                    initialViewState: new PSPDFKit.ViewState({
                        formDesignMode: false,
                        // enableAnnotationToolbar: false,
                        sidebarMode: null,
                    }),
                    // editableAnnotationTypes: [],

                })
                .then(async (instance) => {
                    _instance = instance;
                    console.log("PSPDFKit loaded", instance);
                    URL.revokeObjectURL(documentBlobObjectUrl);

                    const signaturesString = localStorage.getItem(STORAGE_KEY);

                    if (signaturesString) {
                        const storedSignatures = JSON.parse(signaturesString);
                        // Construct annotations from serialized entries and call setStoredSignatures API
                        const list = PSPDFKit.Immutable.List(
                            storedSignatures.map(PSPDFKit.Annotations.fromSerializableObject)
                        );

                        instance.setStoredSignatures(list);

                        const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);

                        if (attachmentsString) {
                            const attachmentsArray = JSON.parse(attachmentsString);
                            // from the data URLs on local storage instantiate Blob objects
                            const blobs = await Promise.all(
                            attachmentsArray.map(({ url }) =>
                                fetch(url).then((res) => res.blob())
                            )
                            );

                            // create an attachment for each blob
                            blobs.forEach(instance.createAttachment);
                        }
                    }

                    instance.addEventListener("storedSignatures.create", async (annotation) => {
                        const signaturesString = localStorage.getItem(STORAGE_KEY);
                        const storedSignatures = signaturesString ? JSON.parse(signaturesString) : [];

                        const serializedAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);

                            console.log(storedSignatures);
                        if (annotation.imageAttachmentId) {
                            const attachment = await instance.getAttachment(
                            annotation.imageAttachmentId
                            );

                            // Create data URL and add it to local storage.
                            // Note: This is done only for demonstration purpose.
                            // Storing potential large chunks of data using local storage is
                            // considered bad practice due to the synchronous nature of that API.
                            // For production applications, please consider alternatives such a
                            // dedicated back-end storage or IndexedDB.
                            const url = await fileToDataURL(attachment);

                            //Store this for signature
                            console.log(url);


                            const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);
                            const attachmentsArray = attachmentsString
                            ? JSON.parse(attachmentsString)
                            : [];

                            attachmentsArray.push({ url, id: annotation.imageAttachmentId });
                            // localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachmentsArray));
                        }

                        storedSignatures.push(serializedAnnotation);
                        // localStorage.setItem(STORAGE_KEY, JSON.stringify(storedSignatures));
                        // Add new annotation so that its render as part of the UI on the current session
                        instance.setStoredSignatures((signatures) => signatures.push(annotation));
                    });

                    instance.addEventListener("storedSignatures.delete", (annotation) => {
                        const signaturesString = localStorage.getItem(STORAGE_KEY);
                        const storedSignatures = signaturesString
                            ? JSON.parse(signaturesString)
                            : [];
                        const annotations = storedSignatures.map(
                            PSPDFKit.Annotations.fromSerializableObject
                        );
                        const updatedAnnotations = annotations.filter(
                            (currentAnnotation) => !currentAnnotation.equals(annotation)
                        );

                        // localStorage.setItem(
                        //     STORAGE_KEY,
                        //     JSON.stringify(
                        //     updatedAnnotations.map(PSPDFKit.Annotations.toSerializableObject)
                        //     )
                        // );
                        // Use setStoredSignatures API so that the current UI is properly updated
                        instance.setStoredSignatures((signatures) =>
                            signatures.filter((signature) => !signature.equals(annotation))
                        );

                        if (annotation.imageAttachmentId) {
                            // Remove attachment from array
                            const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);

                            if (attachmentsString) {
                            let attachmentsArray = JSON.parse(attachmentsString);

                            attachmentsArray = attachmentsArray.filter(
                                (attachment) => attachment.id !== annotation.imageAttachmentId
                            );
                            // localStorage.setItem(
                            //     ATTACHMENTS_KEY,
                            //     JSON.stringify(attachmentsArray)
                            // );
                            }
                        }
                    });

                    instance.addEventListener("formFieldValues.update", formFields => {
                        //TODO : Save database values
                        const formFieldValues = instance.getFormFieldValues();
                        console.log(formFieldValues); // { textField: 'Text Value', checkBoxField: ['A', 'B'], buttonField: null }
                    });

                    instance.addEventListener("inkSignatures.change", async () => {
                        const signatures = await instance.getInkSignatures();
                        const signaturesJSON =
                            signatures
                            .map((signature) =>
                                PSPDFKit.Annotations.toSerializableObject(signature)
                            )
                            .toJS()
                        ;

                        console.log(signaturesJSON);
                        // localStorage.setItem("inkSignatures", signaturesJSON);
                    });


                    return instance;
                })
                .catch(function(error) {
                    console.error(error.message);
                });
            }

            function fileToDataURL(file) {
                return new Promise((resolve) => {
                    const reader = new FileReader();

                    reader.onload = function () {
                    resolve(reader.result);
                    };
                    reader.readAsDataURL(file);
                });
            }

        </script>
    </body>
</html>
