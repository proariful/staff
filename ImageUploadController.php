<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ImageUploadController extends Controller
{
    /**
     * Handle image upload.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function upload(Request $request)
    {
        // Validate the request to ensure a file is provided
        $request->validate([
            'file' => 'required|image|mimes:jpeg,png,jpg,gif|max:2048', // Allow only image files up to 2MB
        ]);

        try {
            // Store the uploaded file in the 'uploads' directory
            $filePath = $request->file('file')->store('uploads', 'public');

            // Return a success response with the file path
            return response()->json([
                'success' => true,
                'message' => 'File uploaded successfully.',
                'file_path' => Storage::url($filePath),
            ], 200);
        } catch (\Exception $e) {
            // Handle any errors during the upload process
            return response()->json([
                'success' => false,
                'message' => 'File upload failed.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
