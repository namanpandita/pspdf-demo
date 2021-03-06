import * as React from "react";
import styles, { property as propertyStyles } from "./styles";
import classes from "classnames";
import * as ReactDOM from 'react-dom';
import PSPDFKit from "pspdfkit";

// Form Designer Example
//
// This example differs from the others, since it consists of multiple phases
// for the user to travel through. As a result, it depends a lot on toggling CSS
// classes based on React state.
//
// In addition, this example will load 3 instances to serve the roles of form
// designing, signing/filling form fields, then finally allowing the user to
// view and download the completed document.

let editableAnnotationTypes;
let instance;

let fieldsData = [
    {
        "id" : 1,
        "name" : "CheckBoxField",
        "values" : [1, 2, 3, 4],
        "label": "Check Box",
        "type" : "checkbox"
    },
    {
        "id" : 2,
        "name" : "CheckBoxField1",
        "label": "Check Box",
        "values" : [5, 10, 15],
        "type" : "checkbox"
    },
    {
        "id" : 3,
        "name" : "gender",
        "label" : "Gender",
        "values" : ["Male", "Female"],
        "type" : "radio"
    },
    {
        "id" : 4,
        "name" : "terms&conditions",
        "label" : "Terms and Conditions",
        "values" : ["Accept", "Decline"],
        "type" : "radio"
    },
    {
        "id" : 5,
        "name" : "Countries",
        "label" : "Countries",
        "values" : ["India", "Australia", "USA", "Nedherlands"],
        "type" : "dropdown"
    }
];
// These are assigned within the React component below, since they need access
// to the component state
let handleAnnotationsCreate;
let handleAnnotationsUpdate;
let handleAnnotationSelectionChange;
let handleFormFieldsCreate;

let ua;

if (typeof navigator !== "undefined" && navigator.userAgent != null) {
  ua = navigator.userAgent;
}

let isIe = false;

if (ua != null) {
  isIe = ua.indexOf("MSIE ") !== -1 || ua.indexOf("Trident/") !== -1;
}

let dndDataMimeType = !isIe ? "text/plain" : "text";

let configuration;

export function load(defaultConfiguration) {
  configuration = defaultConfiguration;
  editableAnnotationTypes = [
    PSPDFKit.Annotations.WidgetAnnotation,
    PSPDFKit.Annotations.TextAnnotation,
  ];

  const initialViewState = new PSPDFKit.ViewState({
    showToolbar: true,
    enableAnnotationToolbar: false,
    sidebarMode: null,
    // We need to enable form design mode so that we can create and edit
    // widgets/form fields.
    formDesignMode: true,
  });

  // PSPDFKit freezes the Options object to prevent changes after the first load
  if (!Object.isFrozen(PSPDFKit.Options)) {
    // We don't allow saving signatures here, since the landlord and tenant are
    // different people
    // PSPDFKit.Options.SIGNATURE_SAVE_MODE = PSPDFKit.SignatureSaveMode.NEVER;
  }

  return PSPDFKit.load({
    ...defaultConfiguration,
    initialViewState,
    annotationTooltipCallback,
    editableAnnotationTypes,
  }).then((result) => {
    instance = result;
    const items = instance.toolbarItems;

    console.log(items)
    // Hide the toolbar item with the `id` "ink"
    // by removing it from the array of items.
    instance.setToolbarItems(items.filter((item) => item.type === "export-pdf"));
    // Listen to press events so that the properties view reflects the currently
    // selected widget
    instance.addEventListener("formFields.create", handleFormFieldsCreate);
    instance.addEventListener("annotations.create", handleAnnotationsCreate);
    instance.addEventListener("annotations.update", handleAnnotationsUpdate);
    instance.addEventListener(
      "annotationSelection.change",
      handleAnnotationSelectionChange
    );

    const pageEl = instance.contentDocument.querySelector(".PSPDFKit-Page");

    instance.contentDocument.addEventListener("dragover", (event) => {
      if (pageEl.contains(event.target)) {
        // If the element under the cursor is within the PSPDFKit Page element,
        // we disable the default browser behavior. This allows us to implement
        // DND.
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();
      }
    });

    instance.contentDocument.addEventListener("drop", (event) => {
        var data = JSON.parse(event.dataTransfer.getData(dndDataMimeType));
        const annotationType = data.type;
        const fieldData = data.field;
        if (pageEl.contains(event.target) && annotationType !== "") {
            const pretransformedRect = new PSPDFKit.Geometry.Rect({
            left: event.clientX,
            top: event.clientY,
            width: 50,
            height: 50,
            });

            // We need to convert from browser units into page units
            const annotationRect = instance.transformContentClientToPageSpace(
            pretransformedRect,
            0
            );

            event.preventDefault();

            insertAnnotation(annotationType, {
            left: annotationRect.left,
            top: annotationRect.top,
            }, fieldData);
        }
    });

    return instance;
  });
}

function annotationTooltipCallback(annotation) {
  // We show a tooltip popup when clicking on an annotation to allow the user to
  // delete the inserted annotation

  const toolItemDeleteAnnotation = {
    type: "custom",
    title: "Delete",
    onPress: () => {
      if (confirm("Do you really want to delete the form widget?")) {
        instance.delete(annotation.id);
      }
    },
  };

  return [toolItemDeleteAnnotation];
}

let insertableAnnotations = [
  {
    type: "text-anno",
    label: "Text (Non-Editable)",
    description:
      "Use a plain text annotation to fill out the blanks above the form (double-click to set the text in advance)",
    icon: "anno_text",
  },

  {
    type: "text-field",
    label: "Text",
    description:
      "Use a text field to allow the signer to fill out the name and date sections within the form area",
    icon: "form_text",
  },

  {
    type: "signature-field",
    label: "Signature",
    description:
      "Use a signature field to allow the signer to fill out the signature section within the form area",
    icon: "form_signature",
  },

  {
    type: "checkboxes",
    label: "Checkbox",
    description:
      "Use a check box",
    icon: "form_checkbox",
  },

  {
    type: "dropdown",
    label: "Dropdown",
    description:
      "Use a dropdown",
    icon: "form_dropdown",
  },

  {
    type: "radio",
    label: "Radio Box",
    description:
      "Use a radio box",
    icon: "form_radio",
  },

  {
    type: "button",
    label: "Buttons",
    description:
      "Use a button",
    icon: "form_button",
  },

  {
    type: "combo",
    label: "Combo Box",
    description:
      "Use a combo box",
    icon: "form_combo",
  },
];

// const insertableAnnotations = fieldsData;

function createFormFieldName(type) {
  return `form-field-${type}-${Math.random().toString(36).slice(-5)}`;
}

function insertAnnotation(type, position) {
  // We need to reference this when creating both the widget annotation and the
  // form field itself, so that they are linked.

  const formFieldName = createFormFieldName(type);
  const widgetProperties = {
    id: PSPDFKit.generateInstantId(),
    pageIndex: instance.viewState.currentPageIndex,
    formFieldName,
  };

  const checkboxWidgetProperties = {
    pageIndex: instance.viewState.currentPageIndex,
    formFieldName,
  };
  let left = 30;
  let top = 30;

  // The position may or may not be initialized from the drop location from DND.
  if (position != null) {
    left = position.left;
    top = position.top;
  }

//   switch (type) {
//     case "text-field": {
//         const widget = new PSPDFKit.Annotations.WidgetAnnotation({
//             ...widgetProperties,
//             borderColor: PSPDFKit.Color.BLACK,
//             borderWidth: 1,
//             borderStyle: "solid",
//             backgroundColor: new PSPDFKit.Color({ r: 220, g: 240, b: 255 }),

//             // This data tells us whether the landlord or tenant can fill in this
//             // form field. Otherwise it will be disabled.
//             customData: { forSigner: "landlord" },

//             boundingBox: new PSPDFKit.Geometry.Rect({
//               left,
//               top,
//               width: 225,
//               height: 15,
//             }),
//           });

//           const formField = new PSPDFKit.FormFields.TextFormField({
//             name: formFieldName,
//             // Link to the annotation with the ID
//             annotationIds: new PSPDFKit.Immutable.List([widget.id]),
//           });

//     //   const widget = new PSPDFKit.Annotations.WidgetAnnotation({
//     //     id: PSPDFKit.generateInstantId(),
//     //     formFieldName: 'TextformField',
//     //     pageIndex: 0,
//     //     borderColor: PSPDFKit.Color.BLACK,
//     //     borderWidth: 1,
//     //     borderStyle: "solid",
//     //     backgroundColor: new PSPDFKit.Color({ r: 220, g: 240, b: 255 }),
//     //     customData: { forSigner: "landlord" },
//     //     boundingBox: new PSPDFKit.Geometry.Rect({
//     //       left,
//     //       top,
//     //       width: 225,
//     //       height: 15,
//     //     }),
//     //   });

//     //   const formField = new PSPDFKit.FormFields.TextFormField({
//     //     name: 'TextformField',
//     //     // Link to the annotation with the ID
//     //     annotationIds: new PSPDFKit.Immutable.List([widget.id]),
//     //   });

//       instance.create([widget, formField]);
//       break;
//     }

//     case "signature-field": {
//       const widget = new PSPDFKit.Annotations.WidgetAnnotation({
//         ...widgetProperties,
//         borderColor: PSPDFKit.Color.BLACK,
//         borderWidth: 1,
//         borderStyle: "solid",
//         backgroundColor: PSPDFKit.Color.WHITE,
//         customData: { forSigner: "landlord" },
//         boundingBox: new PSPDFKit.Geometry.Rect({
//           left,
//           top,
//           width: 225,
//           height: 30,
//         }),
//       });

//       const formField = new PSPDFKit.FormFields.SignatureFormField({
//         name: formFieldName,
//         annotationIds: new PSPDFKit.Immutable.List([widget.id]),
//       });

//       instance.create([widget, formField]);
//       break;
//     }

//     case "text-anno": {
//       // We don't need a form field here since it is just a regular annotation.

//       instance.create(
//         new PSPDFKit.Annotations.TextAnnotation({
//           pageIndex: instance.viewState.currentPageIndex,
//           text: "Text Annotation",
//           fontSize: 10,
//           boundingBox: new PSPDFKit.Geometry.Rect({
//             left,
//             top,
//             width: 100,
//             height: 12,
//           }),
//         })
//       );

//       break;
//     }

//     case "checkbox": {
//         var instanceArr = [];
//         var options = [];
//         field.values.map((id) => {
//             instanceArr.push(new PSPDFKit.Annotations.WidgetAnnotation({
//                 id: id,
//                 pageIndex: 0,
//                 formFieldName: field.name,
//                 customData: { forSigner: "landlord" },
//                 boundingBox: new PSPDFKit.Geometry.Rect({
//                     left: 100,
//                     top: 100,
//                     width: 20,
//                     height: 20,
//                 }),
//             }));
//         });

//         field.values.map((data) => {
//             options.push(
//                 new PSPDFKit.FormOption({
//                     label: 'Option ' + Math.random().toString(36).slice(-5),
//                     value: data,
//                 })
//             );
//         });

//         instanceArr.push(new PSPDFKit.FormFields.CheckBoxFormField({
//             id: PSPDFKit.generateInstantId(),
//             name: field.name,
//             annotationIds: new PSPDFKit.Immutable.List(field.values),
//             options: new PSPDFKit.Immutable.List(options),
//             isDeletable: true,
//             isEditable: true,
//             isFillable: true
//         }));

//         instance.create(instanceArr);
//         break;
//     }

//     case "dropdown" : {
//         var instanceArr = [];
//         var options = [];

//         instanceArr.push(new PSPDFKit.Annotations.WidgetAnnotation({
//             id: field.id,
//             pageIndex: 0,
//             formFieldName: field.name,
//             customData: { forSigner: "landlord" },
//             boundingBox: new PSPDFKit.Geometry.Rect({
//                 left: 100,
//                 top: 100,
//                 width: 20,
//                 height: 20,
//             }),
//         }));

//         field.values.map((data) => {
//             options.push(
//                 new PSPDFKit.FormOption({
//                     label: data,
//                     value: data,
//                 })
//             );
//         });

//         instanceArr.push(new PSPDFKit.FormFields.ListBoxFormField({
//             id: PSPDFKit.generateInstantId(),
//             name: field.name,
//             annotationIds: new PSPDFKit.Immutable.List([field.id]),
//             options: new PSPDFKit.Immutable.List(options),
//             multiSelect: true
//         }));

//         instance.create(instanceArr);

//         break;
//     }

//     case "radio" : {
//         var instanceArr = [];
//         var options = [];

//         field.values.map((id) => {
//             instanceArr.push(new PSPDFKit.Annotations.WidgetAnnotation({
//                 id: id,
//                 pageIndex: 0,
//                 formFieldName: field.name,
//                 customData: { forSigner: "landlord" },
//                 boundingBox: new PSPDFKit.Geometry.Rect({
//                     left: 100,
//                     top: 100,
//                     width: 20,
//                     height: 20,
//                 }),
//             }));
//         });

//         field.values.map((data) => {
//             options.push(
//                 new PSPDFKit.FormOption({
//                     label: 'Option ' + Math.random().toString(36).slice(-5),
//                     value: data,
//                 })
//             );
//         });

//         instanceArr.push(new PSPDFKit.FormFields.RadioButtonFormField({
//             id: PSPDFKit.generateInstantId(),
//             name: field.name,
//             annotationIds: new PSPDFKit.Immutable.List(field.values),
//             options: new PSPDFKit.Immutable.List(options),
//             isDeletable: true,
//             isEditable: true,
//             isFillable: true
//         }));

//         instance.create(instanceArr);

//         break;
//     }

//     case "button" : {
//         const buttonWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
//             id: PSPDFKit.generateInstantId(),
//             pageIndex: 0,
//             formFieldName: 'ButtonFormField',
//             customData: { forSigner: "landlord" },
//             boundingBox: new PSPDFKit.Geometry.Rect({
//                 left: 100,
//                 top: 100,
//                 width: 20,
//                 height: 20,
//             }),
//         });

//         const formField = new PSPDFKit.FormFields.ButtonFormField({
//             name: 'ButtonFormField',
//             annotationIds: new PSPDFKit.Immutable.List([
//                 buttonWidget1.id,
//             ]),
//             id: PSPDFKit.generateInstantId(),
//             label : "Button Form",
//             isDeletable: true,
//             isEditable: true,
//             isFillable: true,
//         });

//         instance.create([buttonWidget1, formField]);
//         break;
//     }

//     case "combo" : {
//         const comboWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
//             id: PSPDFKit.generateInstantId(),
//             pageIndex: 0,
//             formFieldName: 'ComboFormField',
//             customData: { forSigner: "landlord" },
//             boundingBox: new PSPDFKit.Geometry.Rect({
//                 left: 100,
//                 top: 100,
//                 width: 20,
//                 height: 20,
//             }),
//         });

//         const formField = new PSPDFKit.FormFields.ComboBoxFormField({
//             name: 'ComboFormField',
//             annotationIds: new PSPDFKit.Immutable.List([
//                 comboWidget1.id,
//             ]),
//             options: new PSPDFKit.Immutable.List([
//                 //TODO: Make this dynamic from database for dropdown
//                 new PSPDFKit.FormOption({
//                     label: 'Option 1',
//                     value: '1',
//                 }),
//                 new PSPDFKit.FormOption({
//                     label: 'Option 2',
//                     value: '2',
//                 }),
//             ]),
//             edit: true,
//             isDeletable: true,
//             isEditable: true,
//             isFillable: true,
//             label: 'Combo Form',
//         });

//         instance.create([comboWidget1, formField]);
//         break;
//     }
//     default:
//       throw new Error(`Can't insert unknown annotation! (${type})`);
//   }

switch (type) {
    case "text-field": {
        const widget = new PSPDFKit.Annotations.WidgetAnnotation({
            ...widgetProperties,
            borderColor: PSPDFKit.Color.BLACK,
            borderWidth: 1,
            borderStyle: "solid",
            backgroundColor: new PSPDFKit.Color({ r: 220, g: 240, b: 255 }),

            // This data tells us whether the landlord or tenant can fill in this
            // form field. Otherwise it will be disabled.
            customData: { forSigner: "landlord" },

            boundingBox: new PSPDFKit.Geometry.Rect({
              left,
              top,
              width: 225,
              height: 15,
            }),
          });

          const formField = new PSPDFKit.FormFields.TextFormField({
            name: formFieldName,
            // Link to the annotation with the ID
            annotationIds: new PSPDFKit.Immutable.List([widget.id]),
          });

    //   const widget = new PSPDFKit.Annotations.WidgetAnnotation({
    //     id: PSPDFKit.generateInstantId(),
    //     formFieldName: 'TextformField',
    //     pageIndex: 0,
    //     borderColor: PSPDFKit.Color.BLACK,
    //     borderWidth: 1,
    //     borderStyle: "solid",
    //     backgroundColor: new PSPDFKit.Color({ r: 220, g: 240, b: 255 }),
    //     customData: { forSigner: "landlord" },
    //     boundingBox: new PSPDFKit.Geometry.Rect({
    //       left,
    //       top,
    //       width: 225,
    //       height: 15,
    //     }),
    //   });

    //   const formField = new PSPDFKit.FormFields.TextFormField({
    //     name: 'TextformField',
    //     // Link to the annotation with the ID
    //     annotationIds: new PSPDFKit.Immutable.List([widget.id]),
    //   });

      instance.create([widget, formField]);
      break;
    }

    case "signature-field": {
      const widget = new PSPDFKit.Annotations.WidgetAnnotation({
        ...widgetProperties,
        borderColor: PSPDFKit.Color.BLACK,
        borderWidth: 1,
        borderStyle: "solid",
        backgroundColor: PSPDFKit.Color.WHITE,
        customData: { forSigner: "landlord" },
        boundingBox: new PSPDFKit.Geometry.Rect({
          left,
          top,
          width: 225,
          height: 30,
        }),
      });

      const formField = new PSPDFKit.FormFields.SignatureFormField({
        name: formFieldName,
        annotationIds: new PSPDFKit.Immutable.List([widget.id]),
      });

      instance.create([widget, formField]);
      break;
    }

    case "text-anno": {
      // We don't need a form field here since it is just a regular annotation.

      instance.create(
        new PSPDFKit.Annotations.TextAnnotation({
          pageIndex: instance.viewState.currentPageIndex,
          text: "Text Annotation",
          fontSize: 10,
          boundingBox: new PSPDFKit.Geometry.Rect({
            left,
            top,
            width: 100,
            height: 12,
          }),
        })
      );

      break;
    }

    case "checkboxes": {
        //TODO: Make this dynamic from database for dropdown
        const checkboxWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...checkboxWidgetProperties,
            id : PSPDFKit.generateInstantId(),
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 100,
                top: 100,
                width: 20,
                height: 20,
            }),
        });
        const checkboxWidget2 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...checkboxWidgetProperties,
            id : PSPDFKit.generateInstantId(),
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 130,
                top: 100,
                width: 20,
                height: 20,
            }),
        });

        const formField = new PSPDFKit.FormFields.CheckBoxFormField({
            name: formFieldName,
            annotationIds: new PSPDFKit.Immutable.List([
                checkboxWidget1.id,
                checkboxWidget2.id,
            ]),
            options: new PSPDFKit.Immutable.List([
                new PSPDFKit.FormOption({
                    label: 'Option 1',
                    value: 'Yes',
                }),
                new PSPDFKit.FormOption({
                    label: 'Option 2',
                    value: 'No',
                }),
            ]),
            isDeletable: true,
            isEditable: true,
            isFillable: true
        });

        instance.create([checkboxWidget1, checkboxWidget2, formField]);
        break;
    }

    case "dropdown" : {
        const dropdownWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...widgetProperties,
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 100,
                top: 100,
                width: 20,
                height: 20,
            }),
        });

        const formField = new PSPDFKit.FormFields.ListBoxFormField({
            name: formFieldName,
            annotationIds: new PSPDFKit.Immutable.List([
                dropdownWidget1.id,
            ]),
            options: new PSPDFKit.Immutable.List([
                //TODO:  Make this dynamic from database for dropdown
                new PSPDFKit.FormOption({
                    label: 'Option 1',
                    value: '1',
                }),
                new PSPDFKit.FormOption({
                    label: 'Option 2',
                    value: '2',
                }),
            ]),
            defaultValue: '1',
            multiSelect: true
        });

        instance.create([dropdownWidget1, formField]);
        break;
    }

    case "radio" : {
        const radioWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...checkboxWidgetProperties,
            id : PSPDFKit.generateInstantId(),
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 100,
                top: 100,
                width: 20,
                height: 20,
            }),
        });
        const radioWidget2 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...checkboxWidgetProperties,
            id : PSPDFKit.generateInstantId(),
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 130,
                top: 100,
                width: 20,
                height: 20,
            }),
        });
        const formField = new PSPDFKit.FormFields.RadioButtonFormField({
            name: formFieldName,
            annotationIds: new PSPDFKit.Immutable.List([
                radioWidget1.id,
                radioWidget2.id,
            ]),
            options: new PSPDFKit.Immutable.List([
                //TODO: Make this dynamic from database for dropdown
                new PSPDFKit.FormOption({
                    label: 'Option 1',
                    value: '1',
                }),
                new PSPDFKit.FormOption({
                    label: 'Option 2',
                    value: '2',
                }),
            ]),
            isDeletable: true,
            isEditable: true,
            isFillable: true
        });

        instance.create([radioWidget1, radioWidget2, formField]);
        break;
    }

    case "button" : {
        const buttonWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...widgetProperties,
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 100,
                top: 100,
                width: 20,
                height: 20,
            }),
        });

        const formField = new PSPDFKit.FormFields.ButtonFormField({
            name: formFieldName,
            annotationIds: new PSPDFKit.Immutable.List([
                buttonWidget1.id,
            ]),
            id: PSPDFKit.generateInstantId(),
            label : "Button Form",
            isDeletable: true,
            isEditable: true,
            isFillable: true,
        });

        instance.create([buttonWidget1, formField]);
        break;
    }

    case "combo" : {
        const comboWidget1 = new PSPDFKit.Annotations.WidgetAnnotation({
            ...widgetProperties,
            customData: { forSigner: "landlord" },
            boundingBox: new PSPDFKit.Geometry.Rect({
                left: 100,
                top: 100,
                width: 20,
                height: 20,
            }),
        });

        const formField = new PSPDFKit.FormFields.ComboBoxFormField({
            name: formFieldName,
            annotationIds: new PSPDFKit.Immutable.List([
                comboWidget1.id,
            ]),
            options: new PSPDFKit.Immutable.List([
                //TODO: Make this dynamic from database for dropdown
                new PSPDFKit.FormOption({
                    label: 'Option 1',
                    value: '1',
                }),
                new PSPDFKit.FormOption({
                    label: 'Option 2',
                    value: '2',
                }),
            ]),
            edit: true,
            isDeletable: true,
            isEditable: true,
            isFillable: true,
            label: 'Combo Form',
        });

        instance.create([comboWidget1, formField]);
        break;
    }
    default:
      throw new Error(`Can't insert unknown annotation! (${type})`);
  }
}

function handleInsertableAnnoClick(event) {
    // Extract the type from the data-annotation-type attribute
    const type = event.currentTarget.dataset.annotationType;
  console.log('type')
  console.log(type)
    insertAnnotation(type);
  }

function handleInsertableAnnoDragStart(event) {
  if (!isIe) {
    event.dataTransfer.dropEffect = "copy";
  }

  event.dataTransfer.setData(
    dndDataMimeType,

    // We store the annotation type in the event so that we know what type of
    // annotation to insert when the user drops.
    JSON.stringify({
        type : event.currentTarget.dataset.annotationType,
        field : {
            values: event.currentTarget.dataset.annotationValues,
            name: event.currentTarget.dataset.annotationName,
            id: event.currentTarget.dataset.id,
        }
    })
  );

  event.stopPropagation();
}

let loadedSigningContainer = false;
let signingInstance;
let viewingInstance;

// The call to forwardRef allows us to create a component exposes a React ref
// pointing to an element within the CustomContainer component, allowing the
// catalog to mount the PSPDFKit instance at the ref location.
export const CustomContainer = React.forwardRef((props, ref) => {
  // The widget which has focus in the PSPDFKit container
  const [selectedWidget, setSelectedWidget] = React.useState(null);

  // Phases the user has seen in the following order: [previous, current]
  // Phase 0 doesn't exist - it's a placeholder value.
  //
  // Phase 1: Introduction phase informing the user about the example
  // Phase 2: Design phase where the user can drag form elements on the document
  // Phase 3: Signer selection phase where the user can choose to sign as either
  //          the landlord or tenant
  // Phase 4: Signing phase where the selected signer fills in form elements
  //          which are assigned to them
  // Phase 5: Informational phase telling the user that the signers will be
  //          switched
  // Phase 6: Information phase telling the user that the signing has been
  //          completed and they can now proceed to download/view the document
  // Phase 7: Final viewing/downloading phase
  const [visitedPhases, setVisitedPhases] = React.useState([0, 1]);

  const currentPhase = visitedPhases[1];
  const prevPhase = visitedPhases[0];

  // The signer(s) that are signing the document. Will eventually contain
  // 'landlord' and 'tenant' in either order.
  const [signers, setSigners] = React.useState([]);

  const currentSigner = signers[signers.length - 1];

  // Refernces to PSPDFKit container elements
  const signingContainerRef = React.useRef(null);
  const viewingContainerRef = React.useRef(null);

  // PDF array buffer used to transfer the form elements between the three
  // instances
  const [exportedPdf, setExportedPdf] = React.useState(null);

  React.useEffect(() => {
      load({
        container: ".pspdf-container",
        document: "http://localhost/storage/closure-form.pdf", // This will come from db
        instant: true,
        licenseKey: "YOUR_LICENSE_KEY_GOES_HERE"
        // initialViewState: new PSPDFKit.ViewState({
        //     formDesignMode: true,
        // })
      });
    // backendchange is a custom event we dispatch on the document element
    document.body.addEventListener("backendchange", () => {
      // Reset to phase 1 when we switch Standalone/Server backends

      setVisitedPhases([0, 1]);
      setSigners(['landlord']);

      if (signingContainerRef.current != null) {
        PSPDFKit.unload(signingContainerRef.current);
        signingInstance = null;
      }

      if (viewingContainerRef.current != null) {
        PSPDFKit.unload(viewingContainerRef.current);
      }

      loadedSigningContainer = false;
    });
  }, []);

  const getAnnotationMatchesSigner = React.useCallback(
    (annotation) => {
      // Only allow the user to fill in a form field if it matches the
      // current signer
      return true;
    },
    [currentSigner]
  );

  React.useEffect(() => {
    // We run phase-specific actions here.

    if (currentPhase === 3) {
        console.log(currentPhase, 'currentPhase');
      // Unload once we are sure the animation has finished
      setTimeout(() => PSPDFKit.unload(instance), 1000);
    } else if (currentPhase === 4) {
        console.log(currentPhase, 'currentPhase');
      if (!loadedSigningContainer) {
        const updatedConfig = {
          ...configuration,
          container: signingContainerRef.current,
          initialViewState: new PSPDFKit.ViewState({
            showToolbar: true,
            enableAnnotationToolbar: false,
            sidebarMode: null,
            toolbarItems: [
                {
                  type: "custom",
                  id: "export-pdf",
                  title: "Export",
                  icon: require("./static/download"),
                  async onPress() {
                    // Here we download the current PDF when the user taps the Export toolbar button.
                    // See https://pspdfkit.com/api/web/PSPDFKit.Instance.html#exportPDF for API details.

                    const supportsDownloadAttribute =
                      HTMLAnchorElement.prototype.hasOwnProperty("download");

                    const buffer = await viewingInstance.exportPDF({ flatten: true });
                    const blob = new Blob([buffer], { type: "application/pdf" });

                    if (navigator.msSaveOrOpenBlob) {
                      navigator.msSaveOrOpenBlob(blob, "download.pdf");
                    } else if (!supportsDownloadAttribute) {
                      const reader = new FileReader();

                      reader.onloadend = () => {
                        const dataUrl = reader.result;

                        downloadPdf(dataUrl);
                      };

                      reader.readAsDataURL(blob);
                    } else {
                      const objectUrl = window.URL.createObjectURL(blob);

                      downloadPdf(objectUrl);
                      window.URL.revokeObjectURL(objectUrl);
                    }
                  },
                },
            ],
          }),

          editableAnnotationTypes,
        };

        if (configuration.document != null) {
          // We are in Standalone mode, so we need to transfer the form widgets
          // and form fields to the new instance.
          //
          // We clone exportedPdf with the .slice() call so that we can reuse it
          // in the future.
          updatedConfig.document = exportedPdf.slice(0);
        //   const arrayBuffer = exportedPdf.slice(0);
        //   const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        //   const formData = new FormData();
        //   formData.append("blob", blob);
        //   fetch("http://localhost/save", {
        //       method: "POST",
        //       body: formData
        //   });
    }

        loadedSigningContainer = true;
        PSPDFKit.load(updatedConfig).then((instance) => {
          signingInstance = instance;
          (async () => {
            //TODO: Save blob data
            const arrayBuffer = await instance.exportPDF();
            const blob = new Blob([arrayBuffer]);
            const formData = new FormData();
            formData.append("blob", blob);
            fetch("http://localhost/save", {
                method: "POST",
                body: formData
            });
          })();
          const items = instance.toolbarItems;
          console.log("PSPDFKit loaded", instance);
          const formFieldValues = instance.getFormFieldValues();
          console.log(formFieldValues);
          console.log(items)
          // Hide the toolbar item with the `id` "ink"
          // by removing it from the array of items.
          instance.setToolbarItems(items.filter((item) => item.type === "export-pdf"));
          instance.setIsEditableAnnotation(getAnnotationMatchesSigner);
        });
      } else {
        signingInstance.setIsEditableAnnotation(getAnnotationMatchesSigner);
      }
    } else if (currentPhase === 7) {
        console.log(currentPhase, 'currentPhase');

      // We will no longer be signing after this point, so we can dispose of the
      // instance.
      PSPDFKit.unload(signingContainerRef.current);

      const updatedConfig = {
        ...configuration,
        container: viewingContainerRef.current,
        initialViewState: new PSPDFKit.ViewState({
          enableAnnotationToolbar: false,
          sidebarMode: null,
        }),
        // No annotations should be editable in the final viewing phase.
        editableAnnotationTypes: [],
        toolbarItems: [
          {
            type: "custom",
            id: "export-pdf",
            title: "Export",
            icon: require("./static/download"),
            async onPress() {
              // Here we download the current PDF when the user taps the Export toolbar button.
              // See https://pspdfkit.com/api/web/PSPDFKit.Instance.html#exportPDF for API details.

              const supportsDownloadAttribute =
                HTMLAnchorElement.prototype.hasOwnProperty("download");

              const buffer = await viewingInstance.exportPDF({ flatten: true });
              const blob = new Blob([buffer], { type: "application/pdf" });

              if (navigator.msSaveOrOpenBlob) {
                navigator.msSaveOrOpenBlob(blob, "download.pdf");
              } else if (!supportsDownloadAttribute) {
                const reader = new FileReader();

                reader.onloadend = () => {
                  const dataUrl = reader.result;

                  downloadPdf(dataUrl);
                };

                reader.readAsDataURL(blob);
              } else {
                const objectUrl = window.URL.createObjectURL(blob);

                downloadPdf(objectUrl);
                window.URL.revokeObjectURL(objectUrl);
              }
            },
          },
        ],
      };

      if (configuration.document != null) {
        updatedConfig.document = exportedPdf.slice(0);
      }

      PSPDFKit.load(updatedConfig).then((instance) => {
        viewingInstance = instance;
      });
    }
  }, [
    currentPhase,
    currentSigner,
    exportedPdf,
    getAnnotationMatchesSigner,
    signers,
    visitedPhases,
  ]);

  const changeProp = React.useCallback(
    (property, value) => {
      const updatedWidget = selectedWidget.set(property, value);

      setSelectedWidget(updatedWidget);
      updateAnnotation(updatedWidget);
    },
    [selectedWidget]
  );

  const handleForSignerChange = React.useCallback(
    (event) => {
      const value = event.target.value;
      const updatedWidget = selectedWidget.set("customData", {
        forSigner: value,
      });

      setSelectedWidget(updatedWidget);
      updateAnnotation(updatedWidget);
    },
    [selectedWidget]
  );

  const handleColorForPropChange = (property) => (event) => {
    changeProp(property, new PSPDFKit.Color(hexToRgb(event.target.value)));
  };

  const handleNumberForPropChange = (property) => (event) => {
    changeProp(property, Number(event.target.value));
  };

  const handleValueForPropChange = (property) => (event) => {
    changeProp(property, event.target.value || "");
  };

  // Individual controls for widget properties, used later when rendering the
  // widget properties section.
  const widgetPropertyData = {
    fontColor: {
      name: "Font Color",
    //   icon: "fill_color",
      input: (selectedWidget) => (
        <input
          type="color"
          className="color-input"
          // input[type='color'] only accepts colors in hex format.
          value={rgbToHex(
            (selectedWidget.fontColor || PSPDFKit.Color.BLACK).toCSSValue()
          )}
          onChange={handleColorForPropChange("fontColor")}
        />
      ),
    },

    borderColor: {
      name: "Border Color",
    //   icon: "border_color",
      input: (selectedWidget) => (
        <input
          type="color"
          className="color-input"
          // input[type='color'] only accepts colors in hex format.
          value={rgbToHex(
            (selectedWidget.borderColor || PSPDFKit.Color.BLACK).toCSSValue()
          )}
          onChange={handleColorForPropChange("borderColor")}
        />
      ),
    },

    backgroundColor: {
      name: "Background Color",
    //   icon: "fill_color",
      input: (selectedWidget) => (
        <input
          type="color"
          className="color-input"
          value={rgbToHex(
            (
              selectedWidget.backgroundColor || PSPDFKit.Color.WHITE
            ).toCSSValue()
          )}
          onChange={handleColorForPropChange("backgroundColor")}
        />
      ),
    },

    borderStyle: {
      name: "Border Style",
    //   icon: "line_style",
      input: (selectedWidget) => (
        <select
          onChange={handleValueForPropChange("borderStyle")}
          value={selectedWidget.borderStyle || ""}
        >
          {borderStyles.map((borderStyle) => (
            <option value={borderStyle} key={borderStyle}>
              {borderStyle}
            </option>
          ))}
        </select>
      ),
    },

    borderWidth: {
      name: "Border Width",
    //   icon: "line_thickness",
      input: (selectedWidget) => (
        <input
          type="number"
          className="number-input"
          value={selectedWidget.borderWidth || 0}
          onChange={handleNumberForPropChange("borderWidth")}
        />
      ),
    },
  };

  const fieldAssociationData = {
    forSigner: {
      // We don't need a name/label here, since we have a header displayed above
      // it.
      name: "",

      input: (selectedWidget) => {
        return (
          <div className="properties__property-radiogroup">
            <label
              htmlFor="for-signer-tenant"
              className={`properties__property-radio-label ${propertyStyles.className}`}
            >
              <input
                type="radio"
                id="for-signer-tenant"
                className={`properties__property-radio ${propertyStyles.className}`}
                name="for-signer"
                value="tenant"
                checked={selectedWidget.customData.forSigner === "tenant"}
                onChange={handleForSignerChange}
              />
              Tenant
            </label>

            <label
              htmlFor="for-signer-landlord"
              className={`properties__property-radio-label ${propertyStyles.className}`}
            >
              <input
                type="radio"
                id="for-signer-landlord"
                className={`properties__property-radio ${propertyStyles.className}`}
                name="for-signer"
                value="landlord"
                checked={selectedWidget.customData.forSigner === "landlord"}
                onChange={handleForSignerChange}
              />
              Landlord
            </label>
          </div>
        );
      },
    },
  };

  // FIXME(miguel): We are setting global instance event handlers here because we need access to the component's
  // setState methods. Change to avoid using global namespace vars.
  React.useEffect(() => {
    handleFormFieldsCreate = (formFields) => {
      const formField = formFields.first();

      // Ensure the corresponding widget annotation is selected
      instance.setSelectedAnnotation(formField.annotationIds.first());
    };

    handleAnnotationsUpdate = async (annotations) => {
      const widget = annotations.first();

      if (widget instanceof PSPDFKit.Annotations.WidgetAnnotation) {
        setSelectedWidget(widget);
      } else {
        setSelectedWidget(null);
      }
    };

    handleAnnotationsCreate = (annos) => {
      instance.setSelectedAnnotation(annos.first());
    };

    handleAnnotationSelectionChange = async () => {
      const widget = instance.getSelectedAnnotation();

      if (widget instanceof PSPDFKit.Annotations.WidgetAnnotation) {
        setSelectedWidget(widget);
      } else {
        setSelectedWidget(null);
      }
    };
  }, [selectedWidget]);

  const renderWidgetProperty = (dataset, property) => {
    // Render an individual property control, showing the label and input.

    return (
      <label
        className={`${propertyStyles.className} properties__property`}
        key={property}
      >
        {dataset[property].icon != null && (
          <img
            className={`properties__property-icon ${propertyStyles.className}`}
            src={`//static/${dataset[property].icon}.svg`}
          />
        )}
        {dataset[property].name}
        {dataset[property].name != "" && (
          <div className="-spacer" />
        )}
        {dataset[property].input(selectedWidget)}
      </label>
    );
  };

  let selectedWidgetProperties = [];

  if (selectedWidget != null) {
    selectedWidgetProperties.push(
      <React.Fragment key="fieldAssociation">
        <span className={`properties__category ${propertyStyles.className}`}>
          Styles
        </span>
      </React.Fragment>
    );

    for (const property in widgetPropertyData) {
      selectedWidgetProperties.push(
        renderWidgetProperty(widgetPropertyData, property)
      );
    }
  }

  const handleContinueClick = () => {
    if (currentPhase === 2) {
        console.log(currentPhase, 'currentPhase');

        instance.exportPDF().then((pdf) => {
            setExportedPdf(pdf);
            setVisitedPhases([currentPhase, 4]);
        });

    } else if (currentPhase === 4) {
        console.log(currentPhase, 'currentPhase');

      if (signers.length === 2) {
        signingInstance.exportPDF().then((pdf) => {
          setExportedPdf(pdf);
        });

        // Skip to the next completion phase now that both have signed.
        setVisitedPhases([currentPhase, 6]);

        return;
      }
    } else if (currentPhase === 5) {
        console.log(currentPhase, 'currentPhase');

      // Add the other signer and let them sign.

      if (currentSigner === "landlord") {
        setSigners(signers.concat(["tenant"]));
      } else {
        setSigners(signers.concat(["landlord"]));
      }

      setVisitedPhases([currentPhase, currentPhase - 1]);

      return;
    }

    setVisitedPhases([currentPhase, currentPhase + 1]);
  };

  const handleFirstSignerClick = (event) => {
    const signer = event.currentTarget.dataset.signer;

    console.log("Going to signing phase with signer", signer);
    setVisitedPhases([currentPhase, currentPhase + 1]);
    setSigners([signer]);
  };

  const getPhaseClasses = React.useCallback(
    (phaseNumber) => {
      return classes("phases__phase", {
        // The active phase will fade in and slide in from the right.
        "phases__phase--active": currentPhase === phaseNumber,

        // The previous phase will fade out and slide out to the left.
        "phases__phase--prev": prevPhase === phaseNumber,
      });
    },
    [currentPhase, prevPhase]
  );

  return (
    <div className="phases">
      <div className={getPhaseClasses(1)}>
        <div className="intro">
          <div className="intro__copy">
            <span className="intro__icon">
              <InlineSvgComponent src={require("./static/phase1.js")} />
            </span>
            <h2>Form Designer</h2>
            <p>
              This example will take you through a scenario where a user can
              insert form fields into a document to create a lease contract,
              with separate signing phases for the Tenant and Landlord.
            </p>
            <button className="intro__continue" onClick={handleContinueClick}>
              Continue
            </button>
          </div>
        </div>
      </div>

      <div className={getPhaseClasses(2)}>
        <div className="design-phase">
          <div className="design-phase__side">
            <div className="design-phase__side-icon">
              <InlineSvgComponent src={require("./static/phase1")} />
            </div>
            <h3 className="design-phase__side-title">Add Form Elements</h3>
            <p className="design-phase__side-subtitle">
              Click a form element type (or drag it to the desired location) to
              add it to the document. You will then be able to customize its
              appearance below.
            </p>

            <div className="design-phase__side-annotations">
              {insertableAnnotations.map((insertableAnno) => {
                return (
                  <div
                    key={insertableAnno.type}
                    className="design-phase__side-annotation"
                  >
                    <div className="design-phase__side-annotation-heading">
                      <span className="design-phase__side-annotation-label">
                        {insertableAnno.label}
                      </span>

                      <button
                        className="design-phase__side-annotation-button"
                        onClick={handleInsertableAnnoClick}
                        data-annotation-type={insertableAnno.type}
                        data-annotation-values={insertableAnno.values}
                        data-annotation-name={insertableAnno.name}
                        data-id={insertableAnno.id}
                        draggable
                        onDragStart={handleInsertableAnnoDragStart}
                      >
                        <img
                        //   src={`/static/${insertableAnno.icon}.svg`}
                          width="32"
                          className="design-phase__side-annotation-button-icon"
                        />
                      </button>
                    </div>

                    <span className="design-phase__side-annotation-description">
                      {insertableAnno.description}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="properties">
              <h3 className="properties__header">Properties</h3>

              {selectedWidget != null ? (
                <>{selectedWidgetProperties}</>
              ) : (
                <span className="properties__none-selected-info">
                  Please select an inserted form widget to configure properties.
                </span>
              )}

              {propertyStyles.styles}
            </div>
          </div>

          <div className="design-phase__main">
            <div className="toolbar">
              <p className="toolbar__text">Form Designer</p>
              <button
                onClick={handleContinueClick}
                className="design-phase__main-save toolbar__button"
              >
                Save
              </button>
            </div>
            <div className="pspdf-container" ref={ref} />
          </div>
        </div>
      </div>

      <div className={getPhaseClasses(3)}>
        <div className="prompt-area">
          <div className="prompt-area__copy">
            <span className="prompt-area__icon">
              <InlineSvgComponent src={require("./static/phase3")} />
            </span>

            <h2>Filling out the form</h2>
            <p>
              In the next step you can fill out the form as one of the roles
              below. Please select one to continue.
            </p>

            <div className="prompt-area__actions">
              <button
                onClick={handleFirstSignerClick}
                data-signer="tenant"
                className="prompt-area__action"
              >
                Tenant
              </button>
              <button
                onClick={handleFirstSignerClick}
                data-signer="landlord"
                className="prompt-area__action"
              >
                Landlord
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={getPhaseClasses(4)}>
        <div className="toolbar">

        </div>
        <div
          ref={signingContainerRef}
          className="pspdf-container pspdf-container--signing"
        />
      </div>

      <div className={getPhaseClasses(5)}>
        <div className="signing-complete-info">
          <h2>Signing complete</h2>
          <p>
            Now the{" "}
            {(() => {
              if (signers.length === 2) {
                // We are changing phases - don't change the text because it
                // will reflow the text during the animation.
                return currentSigner;
              }

              return currentSigner === "landlord" ? "tenant" : "landlord";
            })()}{" "}
            will begin signing.
          </p>

          <button
            className="signing-complete-info__continue"
            onClick={handleContinueClick}
          >
            Continue
          </button>
        </div>
      </div>

      <div className={getPhaseClasses(6)}>
        <div className="signing-complete-info">
          <h2>Signing complete</h2>
          <p>You may now view the completed document.</p>
          <button
            className="signing-complete-info__continue"
            onClick={handleContinueClick}
          >
            Continue
          </button>
        </div>
      </div>

      <div className={getPhaseClasses(7)}>
        <div className="toolbar">
          <p className="toolbar__text">Final Document</p>
          <button className="toolbar__button" onClick={handleResetClick}>
            Reset
          </button>
        </div>
        <div ref={viewingContainerRef} className="pspdf-container" />
      </div>

      <style jsx>{styles}</style>
    </div>
  );
});

function rgbPartToHex(part) {
  const number = Number.parseInt(part, 10);
  const hex = number.toString(16);

  return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(rgb) {
  const csv = rgb.split("(")[1].split(")")[0];
  const split = csv.split(",");
  const [r, g, b] = [split[0].trim(), split[1].trim(), split[2].trim()];

  return `#${rgbPartToHex(r)}${rgbPartToHex(g)}${rgbPartToHex(b)}`;
}

function hexToRgb(hex) {
  const numberPart = hex.split("#")[1];
  const number = parseInt(numberPart, 16);

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function debounce(callback, ms) {
  let timeoutHandle;

  return function (...args) {
    // We want the context of the call site
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;

    const later = () => {
      timeoutHandle = null;
      callback.apply(context, args);
    };

    timeoutHandle && clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(later, ms);
  };
}

const handleResetClick = () => {
  localStorage.removeItem("examples//lastUsedServerDocumentId");
  location.href = "/";
};

// This is debounced to prevent cases such as where selecting a color triggers a
// bunch of callbacks while dragging.
const updateAnnotation = debounce((annotation) => {
  instance.update(annotation);
}, 200);

function downloadPdf(blob) {
  const a = document.createElement("a");

  a.href = blob;
  a.style.display = "none";
  a.download = "download.pdf";
  a.setAttribute("download", "download.pdf");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const InlineSvgComponent = ({ src, ...otherProps }) => {
  return <span {...otherProps} dangerouslySetInnerHTML={{ __html: src }} />;
};

const borderStyles = ["", "solid", "dashed", "beveled", "inset", "underline"];

if (document.getElementById('app')) {
    ReactDOM.render(<CustomContainer />, document.getElementById('app'));
}
