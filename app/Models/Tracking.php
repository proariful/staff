<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Tracking extends Model
{
    use HasFactory;

    protected $table = 'tracking';

    protected $fillable = [
        'starttime',
        'timerseconds',
        'keystrokes',
        'mousemovement',
        'mouseclick',
        'screenshots',
        'project_id',
        'project_name',
        'user_id',
    ];
}
