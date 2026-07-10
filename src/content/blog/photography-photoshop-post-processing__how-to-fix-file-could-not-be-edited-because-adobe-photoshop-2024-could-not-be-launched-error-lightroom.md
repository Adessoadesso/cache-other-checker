---
title: >-
  Update - Fixed: Having Trouble Editing Files from Adobe Lightroom in Photoshop? How to fix Adobe
  Photoshop 2024 Could Not be Launched Error
kicker: Photography, Photoshop and Post-processing
standfirst: To say Adobe are making a right mess of this Photoshop Beta would be an understatement.
description: >-
  Adobe Lightroom Classic currently has an error when editing in Photoshop if Photoshop (Beta) 25.0
  is installed. How to fix this error preventing seamless work
pubDate: "2023-08-01"
updatedDate: "2025-08-09"
heroImage: /media/k2/items/cache/1df239275e5f6d67099a254b5b97e683_XL.jpg
heroImageAlt: Dublin's City Hall
gallery: []
tags:
  - adobe lightroom
  - adobe photoshop
  - lightroom error
  - photoshop beta
  - external editor adobe lightroom classic
author: Darren McLoughlin
draft: false
legacyPath: >-
  /photography-photoshop-post-processing/how-to-fix-file-could-not-be-edited-because-adobe-photoshop-2024-could-not-be-launched-error-lightroom
redirectFrom: []
---

# **In fact it only works to open Photoshop (Beta), if Photoshop is open it will default to the old behaviour of taking minutes to respond, tell you it can't be opened and then create a .tif file.**

# **So if you have Photoshop open it will not work, only if both Photoshop and Photoshop Beta are closed, or if only Photoshop Beta is open, then it will work.**

To say Adobe are making a right mess of this Photoshop Beta would be an understatement.

I was editing some images from Dublin, and this one of city's fine City Hall, it opened in 1779 as the Royal Exchange but functioning since 1851 the city hall. Unfortunately I ran into problems with editing the image.

## If, like countless others, you are having problems with Photoshop hanging then Lightroom showing an error stating "The file could not be edited because Adobe Photoshop 2024 could not be launched.", well you are far from alone.

![Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.](/images/blogWM/2023/August-2023/adobe-lightroom-error-the-file-could-not-be-edited-because-adobe-photoshop-could-not-be-launched-panoramic-ireland.png "Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.")

Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.

The solution in most cases is simple, this is a known and acknowledged bug by Adobe. 

Likely it is because you have also installed **Adobe Photoshop (Beta)**, the newest version has an incorrect reference to Adobe Photoshop 2024 when in fact you have Adobe Photoshop 2023 installed.

This fix will work even if you are using Photoshop for external editing.

For me, on Windows 10, the error started after updating Photoshop Beta to the latest version (25.0).

**CTRL+E** in Lightroom, even with the official Photoshop app already open, caused the program to hang for several minutes after which Lightroom showed that error about Photoshop 2024.

![Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.](/images/blogWM/2023/August-2023/adobe-lightroom-error-adobe-photoshop-2024-2023-panoramic-ireland.png "Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.")

Adobe Lightroom - The file could not be edited because Adobe Photoshop 2024 could not be launched.

After clicking OK, Photoshop did then open the image but it also instantly created a .tif version in the Lightroom filmstrip (normally when editing in Photoshop this tif wouldn't be created until you saved the file).

To fix, open **Creative Cloud Desktop** then go to **Apps**, scroll down to **Beta apps** and click on the three dots beside open for Photoshop (Beta)

Choose Other versions then go to the previous version, in this case I reinstalled 24.7.

![Install version 24.7 of Photoshop (Beta) to fix Lightroom error](/images/blogWM/2023/August-2023/adobe-photoshop-beta-restore-version-24-7-fix-error-panoramic-ireland.png "Install version 24.7 of Photoshop (Beta) to fix Lightroom error")

Install version 24.7 of Photoshop (Beta) to fix Lightroom error

You don't need to uninstall Photoshop (Beta) 25.0 as installing 24.7 here will uninstall the offending most recent, offending version.

Afterwards, Lightroom correctly shows the external editing in Photoshop to be Adobe Photoshop 2023 - **Edit > Preferences... > External Editing > Photoshop Version:**

![Adobe Lightroom External Editor now shows Adobe Photoshop 2023](/images/blogWM/2023/August-2023/adobe-lightroom-external-editing-adobe-photoshop-2023-fixed-panoramic-ireland.png "Adobe Lightroom External Editor now shows Adobe Photoshop 2023")

Adobe Lightroom External Editor now shows Adobe Photoshop 2023

Normality resumes, with Edit in Photoshop 2023 bringing the file instantly into Photoshop and loading it as a .CR2 file and only saving it when choosing to save.

I have read elsewhere of people uninstalling Lightroom and Photoshop but the simple fix is to try this first.

#### It's a big problem, and just one of a number recently introduced since Adobe launched Photoshop (Beta), so if you don't want to attempt this fix an update will be released sooner rather than later.
