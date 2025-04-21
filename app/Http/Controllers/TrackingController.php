<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Tracking;

class TrackingController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->input('data', []);

        // Log the incoming data for debugging
        \Log::info('Incoming tracking data:', $data);

        if (empty($data)) {
            return response()->json(['status' => 'error', 'message' => 'No tracking data provided.'], 400);
        }

        try {
            foreach ($data as $entry) {
                Tracking::create([
                    'starttime' => $entry['starttime'] ?? null,
                    'timerseconds' => $entry['timerseconds'] ?? 0,
                    'keystrokes' => $entry['keystrokes'] ?? 0,
                    'mousemovement' => $entry['mousemovement'] ?? 0,
                    'mouseclick' => $entry['mouseclick'] ?? 0,
                    'screenshots' => $entry['screenshots'] ?? null,
                    'project_id' => $entry['project_id'] ?? null,
                    'project_name' => $entry['project_name'] ?? null,
                    'user_id' => $entry['user_id'] ?? null,
                ]);
            }

            return response()->json(['status' => 'success', 'message' => 'Tracking data saved successfully.']);
        } catch (\Exception $e) {
            // Log the exception for debugging
            \Log::error('Error saving tracking data:', ['error' => $e->getMessage()]);
            return response()->json(['status' => 'error', 'message' => 'Failed to save tracking data.', 'error' => $e->getMessage()], 500);
        }
    }
}
