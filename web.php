<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ImageUploadController;

// Route for image upload
Route::post('/upload', [ImageUploadController::class, 'upload']);